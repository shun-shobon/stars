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

import type { BlurResources, PostProcessBindGroups } from "./bloom";
import {
	createBlurResources,
	createPostProcessBindGroups,
	destroyBlurResources,
	encodeBlurPasses,
} from "./bloom";
import type { Pipelines } from "./pipelines";
import { createPipelines } from "./pipelines";
import type { RenderTextures } from "./textures";
import { createRenderTextures, destroyRenderTextures } from "./textures";
import type { CameraState, LoadProgressCallback, StarfieldMeta } from "./types";

// 型を再エクスポート
export type { CameraState, LoadProgressCallback, StarfieldMeta } from "./types";

export class StarfieldRenderer {
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private format: GPUTextureFormat = "bgra8unorm";

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

		this.format = navigator.gpu.getPreferredCanvasFormat();
		this.context.configure({
			device: this.device,
			format: this.format,
			alphaMode: "opaque",
		});

		// サンプラー作成
		this.sampler = this.device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});

		// パイプライン作成
		this.pipelines = createPipelines(this.device, this.format);

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

		// 新しいリソースを作成
		this.textures = createRenderTextures(this.device, width, height);
		this.blurResources = createBlurResources(
			this.device,
			this.pipelines,
			this.textures,
			this.sampler,
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
		this.starCount = this.meta.starCount;

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
		uniformData[7] = this.meta.maxMagnitude;

		this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
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

		// Pass 1: 星をオフスクリーンテクスチャに描画
		const starPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.textures!.sceneView,
					clearValue: { r: 0, g: 0, b: 0.01, a: 1 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		starPass.setPipeline(this.pipelines!.star);
		starPass.setBindGroup(0, this.starBindGroup);
		starPass.setVertexBuffer(0, this.starBuffer);
		starPass.draw(6, this.loadedStarCount);
		starPass.end();

		// Pass 2: 輝度抽出（シーン -> bloom[0]）
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

		// Pass 3-4: ガウシアンブラー
		encodeBlurPasses(
			commandEncoder,
			this.pipelines!,
			this.textures!,
			this.blurResources!,
		);

		// Pass 5: 最終合成（シーン + ブルーム -> 画面）
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

		this.device!.queue.submit([commandEncoder.finish()]);
	}

	getLoadedStarCount(): number {
		return this.loadedStarCount;
	}

	dispose(): void {
		this.starBuffer?.destroy();
		this.uniformBuffer?.destroy();
		destroyRenderTextures(this.textures);
		destroyBlurResources(this.blurResources);
		this.device?.destroy();
	}
}
