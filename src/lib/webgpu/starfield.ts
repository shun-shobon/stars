/**
 * WebGPUを使用した星空レンダラー（ブルーム効果付き）
 */

import {
	BYTES_PER_STAR,
	TOKYO_LATITUDE_RAD,
	TOKYO_LONGITUDE,
	UNIFORM_BUFFER_SIZE,
} from "~/constants";
import starsMeta from "~/data/stars-meta.json";
import { calculateLocalSiderealTime } from "~/lib/astronomy";
import type { PerformanceProfile } from "~/lib/device";
import { getPerformanceProfile } from "~/lib/device";

import type { BlurResources, PostProcessBindGroups } from "./bloom";
import {
	createBlurResources,
	createPostProcessBindGroups,
	destroyBlurResources,
	encodeBlurPasses,
} from "./bloom";
import type { PipelineOptions, Pipelines } from "./pipelines";
import { createPipelines } from "./pipelines";
import type { RenderTextures, TextureOptions } from "./textures";
import { createRenderTextures, destroyRenderTextures } from "./textures";
import type { CameraState, LoadProgressCallback, StarfieldMeta } from "./types";

// 型を再エクスポート
export type { CameraState, LoadProgressCallback, StarfieldMeta } from "./types";

export class StarfieldRenderer {
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private canvasFormat: GPUTextureFormat = "bgra8unorm";
	private readonly performanceProfile: PerformanceProfile;

	private pipelines: Pipelines | null = null;
	private starBuffer: GPUBuffer | null = null;
	private uniformBuffer: GPUBuffer | null = null;
	private starBindGroup: GPUBindGroup | null = null;
	private sampler: GPUSampler | null = null;

	private textures: RenderTextures | null = null;
	private blurResources: BlurResources | null = null;
	private postProcessBindGroups: PostProcessBindGroups | null = null;

	private starCount = 0;
	private loadedStarCount = 0;
	private meta: StarfieldMeta | null = null;
	private canvas: HTMLCanvasElement | null = null;

	constructor(profile?: PerformanceProfile) {
		this.performanceProfile = profile ?? getPerformanceProfile();
	}

	async init(canvas: HTMLCanvasElement): Promise<void> {
		this.canvas = canvas;

		// eslint-disable-next-line typescript/no-unnecessary-condition -- navigator.gpu may be undefined in non-supporting browsers
		if (!navigator.gpu) {
			throw new Error("WebGPUがサポートされていません");
		}

		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			throw new Error("GPUアダプターの取得に失敗しました");
		}

		this.device = await adapter.requestDevice();

		this.context = canvas.getContext("webgpu");
		if (!this.context) {
			throw new Error("WebGPUコンテキストの取得に失敗しました");
		}

		this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
		this.context.configure({
			device: this.device,
			format: this.canvasFormat,
			alphaMode: "opaque",
		});

		// サンプラー作成
		this.sampler = this.device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});

		// パイプライン作成（パフォーマンスプロファイルに基づく）
		const pipelineOptions: PipelineOptions = {
			canvasFormat: this.canvasFormat,
			renderTextureFormat: this.performanceProfile.textureFormat,
			blurTaps: this.performanceProfile.blurTaps,
		};
		this.pipelines = createPipelines(this.device, pipelineOptions);

		// Uniform buffer作成
		this.uniformBuffer = this.device.createBuffer({
			size: UNIFORM_BUFFER_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
	}

	private recreateRenderTextures(): void {
		if (!this.device || !this.canvas || !this.pipelines || !this.sampler)
			return;

		const width = this.canvas.width;
		const height = this.canvas.height;

		// 古いリソースを破棄
		destroyRenderTextures(this.textures);
		destroyBlurResources(this.blurResources);

		// 新しいリソースを作成（パフォーマンスプロファイルに基づく）
		const textureOptions: TextureOptions = {
			format: this.performanceProfile.textureFormat,
			bloomDownscale: this.performanceProfile.bloomDownscale,
		};
		this.textures = createRenderTextures(
			this.device,
			width,
			height,
			textureOptions,
		);
		this.blurResources = createBlurResources(
			this.device,
			this.pipelines,
			this.textures,
			this.sampler,
			this.performanceProfile.bloomDownscale,
		);
		this.postProcessBindGroups = createPostProcessBindGroups(
			this.device,
			this.pipelines,
			this.textures,
			this.sampler,
		);
	}

	async loadStarData(onProgress?: LoadProgressCallback): Promise<void> {
		if (!this.device || !this.pipelines || !this.uniformBuffer) {
			throw new Error("レンダラーが初期化されていません");
		}

		// メタデータ（importから取得）
		this.meta = starsMeta;
		// パフォーマンスプロファイルに基づいて星の数を制限
		this.starCount = Math.min(
			this.meta.starCount,
			this.performanceProfile.maxStars,
		);

		const totalBytes = this.starCount * BYTES_PER_STAR;

		// 星データバッファを事前に最大サイズで作成
		this.starBuffer = this.device.createBuffer({
			size: totalBytes,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});

		// 星描画用バインドグループ作成
		this.starBindGroup = this.device.createBindGroup({
			layout: this.pipelines.star.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: { buffer: this.uniformBuffer },
				},
			],
		});

		// ストリーミング読み込み
		const dataResponse = await fetch("/stars.bin");
		if (!dataResponse.body) {
			throw new Error("ストリーム読み込みがサポートされていません");
		}

		const reader = dataResponse.body.getReader();
		let receivedBytes = 0;
		let pendingBuffer = new Uint8Array(0);

		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			// 前回の残りと今回のチャンクを結合
			const combined = new Uint8Array(pendingBuffer.length + value.length);
			combined.set(pendingBuffer);
			combined.set(value, pendingBuffer.length);

			// 16バイト境界で処理
			const alignedBytes =
				Math.floor(combined.length / BYTES_PER_STAR) * BYTES_PER_STAR;

			if (alignedBytes > 0) {
				// GPUバッファに書き込み
				const alignedData = combined.slice(0, alignedBytes);
				this.device.queue.writeBuffer(
					this.starBuffer,
					receivedBytes,
					alignedData,
				);

				receivedBytes += alignedBytes;
				this.loadedStarCount = receivedBytes / BYTES_PER_STAR;

				// 進捗コールバック
				if (onProgress) {
					const progress = Math.round((receivedBytes / totalBytes) * 100);
					onProgress(progress, this.loadedStarCount);
				}
			}

			// 余りを保持
			pendingBuffer = combined.slice(alignedBytes);
		}

		// 残りのデータがあれば処理（通常はないはず）
		if (pendingBuffer.length > 0) {
			console.warn(
				`未処理のデータが残っています: ${pendingBuffer.length.toString()} bytes`,
			);
		}

		// 読み込み完了
		this.loadedStarCount = this.starCount;
		if (onProgress) {
			onProgress(100, this.loadedStarCount);
		}
	}

	private isRenderReady(): boolean {
		return Boolean(
			this.device &&
			this.context &&
			this.pipelines &&
			this.starBuffer &&
			this.uniformBuffer &&
			this.starBindGroup &&
			this.canvas &&
			this.meta &&
			this.loadedStarCount > 0,
		);
	}

	private isPostProcessReady(): boolean {
		return Boolean(
			this.textures &&
			this.blurResources &&
			this.postProcessBindGroups &&
			this.blurResources.bindGroups.length >= 2 &&
			this.textures.bloomViews.length >= 2,
		);
	}

	private updateUniforms(camera: CameraState, time: Date): void {
		if (!this.device || !this.uniformBuffer || !this.canvas || !this.meta)
			return;

		const lst = calculateLocalSiderealTime(time, TOKYO_LONGITUDE);

		const uniformData = new Float32Array(16);
		uniformData[0] = camera.azimuth;
		uniformData[1] = camera.altitude;
		uniformData[2] = camera.fov;
		uniformData[3] = this.canvas.width / this.canvas.height;
		uniformData[4] = TOKYO_LATITUDE_RAD;
		uniformData[5] = lst;
		uniformData[6] = this.meta.minMagnitude;
		// パフォーマンスプロファイルに基づいて最大等級を制限
		uniformData[7] = Math.min(
			this.meta.maxMagnitude,
			this.performanceProfile.maxMagnitude,
		);

		this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

		// 共通のカメラuniformデータ（background, composite, silhouette用）
		const cameraUniformData = new Float32Array(4);
		cameraUniformData[0] = camera.altitude; // 視線の高度角
		cameraUniformData[1] = camera.fov; // 視野角
		cameraUniformData[2] = this.canvas.width / this.canvas.height; // アスペクト比
		cameraUniformData[3] = camera.azimuth; // 方位角（silhouette用）

		// background用のカメラuniform更新
		if (this.postProcessBindGroups?.backgroundUniformBuffer) {
			this.device.queue.writeBuffer(
				this.postProcessBindGroups.backgroundUniformBuffer,
				0,
				cameraUniformData,
			);
		}

		// composite用のカメラuniform更新
		if (this.postProcessBindGroups?.compositeUniformBuffer) {
			this.device.queue.writeBuffer(
				this.postProcessBindGroups.compositeUniformBuffer,
				0,
				cameraUniformData,
			);
		}

		// silhouette用のカメラuniform更新
		if (this.postProcessBindGroups?.silhouetteUniformBuffer) {
			this.device.queue.writeBuffer(
				this.postProcessBindGroups.silhouetteUniformBuffer,
				0,
				cameraUniformData,
			);
		}
	}

	render(camera: CameraState, time: Date): void {
		if (!this.isRenderReady()) return;

		// キャンバスサイズが変わったらテクスチャを再作成
		if (
			this.canvas?.width !== this.textures?.width ||
			this.canvas?.height !== this.textures?.height
		) {
			this.recreateRenderTextures();
		}

		if (!this.isPostProcessReady()) return;

		this.updateUniforms(camera, time);

		const commandEncoder = this.device!.createCommandEncoder();

		// Pass 1: 背景（光害グラデーション）をオフスクリーンテクスチャに描画
		const backgroundPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.textures!.sceneView,
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		backgroundPass.setPipeline(this.pipelines!.background);
		backgroundPass.setBindGroup(0, this.postProcessBindGroups!.background);
		backgroundPass.draw(6);
		backgroundPass.end();

		// Pass 2: 星を加算ブレンドで背景の上に描画
		const starPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.textures!.sceneView,
					loadOp: "load", // 背景を保持
					storeOp: "store",
				},
			],
		});
		starPass.setPipeline(this.pipelines!.star);
		starPass.setBindGroup(0, this.starBindGroup);
		starPass.setVertexBuffer(0, this.starBuffer);
		starPass.draw(6, this.loadedStarCount);
		starPass.end();

		// Pass 3: 輝度抽出（シーン -> bloom[0]）
		const brightPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.textures!.bloomViews[0]!,
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		brightPass.setPipeline(this.pipelines!.brightPass);
		brightPass.setBindGroup(0, this.postProcessBindGroups!.brightPass);
		brightPass.draw(6);
		brightPass.end();

		// Pass 4-5: ガウシアンブラー（パフォーマンスプロファイルに基づくイテレーション数）
		encodeBlurPasses(
			commandEncoder,
			this.pipelines!,
			this.textures!,
			this.blurResources!,
			this.performanceProfile.bloomIterations,
		);

		// Pass 6: 最終合成（シーン + ブルーム -> 画面）
		const compositePass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.context!.getCurrentTexture().createView(),
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		compositePass.setPipeline(this.pipelines!.composite);
		compositePass.setBindGroup(0, this.postProcessBindGroups!.composite);
		compositePass.draw(6);
		compositePass.end();

		// Pass 7: シルエット（建物スカイライン）を最前面に描画
		const silhouettePass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.context!.getCurrentTexture().createView(),
					loadOp: "load", // 合成結果を保持
					storeOp: "store",
				},
			],
		});
		silhouettePass.setPipeline(this.pipelines!.silhouette);
		silhouettePass.setBindGroup(0, this.postProcessBindGroups!.silhouette);
		silhouettePass.draw(6);
		silhouettePass.end();

		this.device!.queue.submit([commandEncoder.finish()]);
	}

	getLoadedStarCount(): number {
		return this.loadedStarCount;
	}

	dispose(): void {
		this.starBuffer?.destroy();
		this.uniformBuffer?.destroy();
		this.postProcessBindGroups?.backgroundUniformBuffer.destroy();
		this.postProcessBindGroups?.compositeUniformBuffer.destroy();
		this.postProcessBindGroups?.silhouetteUniformBuffer.destroy();
		destroyRenderTextures(this.textures);
		destroyBlurResources(this.blurResources);
		this.device?.destroy();
	}
}
