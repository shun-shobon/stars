/**
 * WebGPUを使用した星空レンダラー（ブルーム効果付き）
 */

import {
	BLOOM_ITERATIONS,
	BLOOM_RESOLUTION_SCALE,
	BYTES_PER_CONSTELLATION_LINE,
	BYTES_PER_STAR,
	CONSTELLATION_LINE_ALPHA,
	CONSTELLATION_LINE_WIDTH,
	CONSTELLATION_UNIFORM_SIZE,
	MAX_CAMERA_OFFSET,
	MAX_FOV,
	MIN_FOV,
	TOKYO_LATITUDE_RAD,
	TOKYO_LONGITUDE,
	UNIFORM_BUFFER_SIZE,
} from "~/constants";
import constellationsMeta from "~/data/constellations-meta.json";
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
import type { SkylineResources } from "./skyline";
import { createSkylineTexture, destroySkylineTexture } from "./skyline";
import type { RenderTextures } from "./textures";
import { createRenderTextures, destroyRenderTextures } from "./textures";
import type {
	CameraState,
	HdrConfig,
	LoadProgressCallback,
	StarfieldMeta,
} from "./types";

// 型を再エクスポート
export type {
	CameraState,
	HdrConfig,
	LoadProgressCallback,
	StarfieldMeta,
} from "./types";

/**
 * HDR対応を検出する
 */
function detectHdrSupport(): boolean {
	// CSS Media Query で HDR ディスプレイを検出
	// eslint-disable-next-line typescript/no-unnecessary-condition -- matchMedia may be undefined in some environments
	if (globalThis.matchMedia) {
		return globalThis.matchMedia("(dynamic-range: high)").matches;
	}
	return false;
}

export class StarfieldRenderer {
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private format: GPUTextureFormat = "bgra8unorm";

	private pipelines: Pipelines | null = null;
	private starBuffer: GPUBuffer | null = null;
	private uniformBuffer: GPUBuffer | null = null;
	private starBindGroup: GPUBindGroup | null = null;
	private sampler: GPUSampler | null = null;

	// 星座線リソース
	private constellationBuffer: GPUBuffer | null = null;
	private constellationUniformBuffer: GPUBuffer | null = null;
	private constellationBindGroup: GPUBindGroup | null = null;
	private constellationLineCount = 0;
	private showConstellations = true;

	private textures: RenderTextures | null = null;
	private blurResources: BlurResources | null = null;
	private postProcessBindGroups: PostProcessBindGroups | null = null;
	private skylineResources: SkylineResources | null = null;

	private starCount = 0;
	private loadedStarCount = 0;
	private meta: StarfieldMeta | null = null;
	private canvas: HTMLCanvasElement | null = null;

	private hdrConfig: HdrConfig = {
		enabled: false,
		toneMappingMode: 0,
	};

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

		// HDR対応を試行
		this.hdrConfig = this.configureCanvasWithHdr();

		// HDR有効時はキャンバスフォーマットを更新
		const canvasFormat = this.hdrConfig.enabled ? "rgba16float" : this.format;

		// サンプラー作成
		this.sampler = this.device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});

		// パイプライン作成
		this.pipelines = createPipelines(this.device, canvasFormat);

		// スカイラインテクスチャ作成（建物シルエット用）
		this.skylineResources = createSkylineTexture(this.device);

		// Uniform buffer作成
		this.uniformBuffer = this.device.createBuffer({
			size: UNIFORM_BUFFER_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
	}

	/**
	 * HDR対応でキャンバスを設定する（失敗時はSDRにフォールバック）
	 */
	private configureCanvasWithHdr(): HdrConfig {
		if (!this.device || !this.context) {
			return { enabled: false, toneMappingMode: 0 };
		}

		const hasHdrDisplay = detectHdrSupport();

		if (hasHdrDisplay) {
			try {
				// HDR設定を試行（rgba16float + extended toneMapping）
				// WebGPU仕様では toneMapping: { mode: "extended" } でHDR出力可能
				this.context.configure({
					device: this.device,
					format: "rgba16float",
					alphaMode: "opaque",
					colorSpace: "display-p3",
					toneMapping: { mode: "extended" },
				} as GPUCanvasConfiguration);

				return { enabled: true, toneMappingMode: 1 };
			} catch {
				console.warn(
					"HDR設定に失敗しました。SDRモードにフォールバックします。",
				);
			}
		}

		// SDRフォールバック
		this.context.configure({
			device: this.device,
			format: this.format,
			alphaMode: "opaque",
		});

		return { enabled: false, toneMappingMode: 0 };
	}

	/**
	 * HDR設定を取得
	 */
	getHdrConfig(): HdrConfig {
		return this.hdrConfig;
	}

	private recreateRenderTextures(): void {
		if (
			!this.device ||
			!this.canvas ||
			!this.pipelines ||
			!this.sampler ||
			!this.skylineResources
		)
			return;

		const width = this.canvas.width;
		const height = this.canvas.height;

		// 古いリソースを破棄
		destroyRenderTextures(this.textures);
		destroyBlurResources(this.blurResources);

		// 新しいリソースを作成
		this.textures = createRenderTextures(
			this.device,
			width,
			height,
			BLOOM_RESOLUTION_SCALE,
		);
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
			this.skylineResources,
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

		// 星座線データも読み込み
		await this.loadConstellationData();
	}

	/**
	 * 星座線データを読み込む
	 */
	private async loadConstellationData(): Promise<void> {
		if (!this.device || !this.pipelines || !this.uniformBuffer) {
			return;
		}

		this.constellationLineCount = constellationsMeta.lineCount;
		const totalBytes =
			this.constellationLineCount * BYTES_PER_CONSTELLATION_LINE;

		// 星座線用Uniformバッファ作成
		this.constellationUniformBuffer = this.device.createBuffer({
			size: CONSTELLATION_UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		// 星座線データバッファ作成
		this.constellationBuffer = this.device.createBuffer({
			size: totalBytes,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});

		// 星座線用バインドグループ作成
		this.constellationBindGroup = this.device.createBindGroup({
			layout: this.pipelines.constellation.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: { buffer: this.constellationUniformBuffer },
				},
			],
		});

		// 星座線バイナリを読み込み
		try {
			const response = await fetch("/constellations.bin");
			const arrayBuffer = await response.arrayBuffer();
			this.device.queue.writeBuffer(
				this.constellationBuffer,
				0,
				new Uint8Array(arrayBuffer),
			);
		} catch (error) {
			console.warn("星座線データの読み込みに失敗しました:", error);
			this.constellationLineCount = 0;
		}
	}

	/**
	 * 星座線の表示/非表示を設定
	 */
	setConstellationVisibility(visible: boolean): void {
		this.showConstellations = visible;
	}

	/**
	 * 星座線の表示状態を取得
	 */
	getConstellationVisibility(): boolean {
		return this.showConstellations;
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

		const uniformData = new Float32Array(20);
		uniformData[0] = TOKYO_LATITUDE_RAD;
		uniformData[1] = lst;
		uniformData[2] = this.meta.minMagnitude;
		uniformData[3] = this.meta.maxMagnitude;

		const aspect = this.canvas.width / this.canvas.height;
		const projectionScale = 1 / Math.tan(camera.fov * 0.5);
		const diagonalFactor = Math.sqrt(1 + aspect * aspect);
		const cullRadius = camera.fov * 0.5 * diagonalFactor * 1.1;
		uniformData[4] = projectionScale;
		uniformData[5] = cullRadius;
		uniformData[6] = aspect;

		// 視線方向の基底ベクトルをCPU側で計算してシェーダー負荷を軽減
		const cosAlt = Math.cos(camera.altitude);
		const viewDir = {
			x: cosAlt * Math.sin(camera.azimuth),
			y: Math.sin(camera.altitude),
			z: cosAlt * Math.cos(camera.azimuth),
		};

		// 注: カメラオフセット機能は現在のシェーダー最適化により省略されています
		// 将来的に必要であれば、uniformに追加することで対応可能です

		const rightTemp = {
			x: viewDir.z,
			y: 0,
			z: -viewDir.x,
		};
		const rightLength = Math.hypot(rightTemp.x, rightTemp.y, rightTemp.z);
		const right =
			rightLength < 0.001
				? { x: 1, y: 0, z: 0 }
				: {
						x: rightTemp.x / rightLength,
						y: rightTemp.y / rightLength,
						z: rightTemp.z / rightLength,
					};

		const up = {
			x: viewDir.y * right.z - viewDir.z * right.y,
			y: viewDir.z * right.x - viewDir.x * right.z,
			z: viewDir.x * right.y - viewDir.y * right.x,
		};
		const upLength = Math.hypot(up.x, up.y, up.z);
		const normalizedUp = {
			x: upLength > 0 ? up.x / upLength : 0,
			y: upLength > 0 ? up.y / upLength : 1,
			z: upLength > 0 ? up.z / upLength : 0,
		};

		uniformData[8] = right.x;
		uniformData[9] = right.y;
		uniformData[10] = right.z;
		uniformData[12] = normalizedUp.x;
		uniformData[13] = normalizedUp.y;
		uniformData[14] = normalizedUp.z;
		uniformData[16] = viewDir.x;
		uniformData[17] = viewDir.y;
		uniformData[18] = viewDir.z;

		this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

		// 共通のカメラuniformデータ（background, composite, silhouette用）
		// 8 floats: altitude, fov, aspect, azimuth, minFov, maxFov, maxCameraOffset, padding
		const cameraUniformData = new Float32Array(8);
		cameraUniformData[0] = camera.altitude; // 視線の高度角
		cameraUniformData[1] = camera.fov; // 視野角
		cameraUniformData[2] = aspect; // アスペクト比
		cameraUniformData[3] = camera.azimuth; // 方位角
		cameraUniformData[4] = MIN_FOV; // 最小視野角
		cameraUniformData[5] = MAX_FOV; // 最大視野角
		cameraUniformData[6] = MAX_CAMERA_OFFSET; // カメラオフセット最大値
		cameraUniformData[7] = 0; // padding

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

		// composite設定uniform更新（HDR/SDR切替）
		if (this.postProcessBindGroups?.compositeSettingsBuffer) {
			const compositeSettings = new Float32Array(4);
			compositeSettings[0] = this.hdrConfig.toneMappingMode; // トーンマッピングモード
			compositeSettings[1] = this.hdrConfig.enabled ? 1 : 1.2; // 露出（HDR時は低め）
			compositeSettings[2] = this.hdrConfig.enabled ? 1.5 : 2; // ブルーム強度（HDR時は控えめ）
			compositeSettings[3] = 0; // padding
			this.device.queue.writeBuffer(
				this.postProcessBindGroups.compositeSettingsBuffer,
				0,
				compositeSettings,
			);
		}

		// 星座線用uniform更新
		if (this.constellationUniformBuffer) {
			const constellationUniformData = new Float32Array(12);
			constellationUniformData[0] = camera.azimuth;
			constellationUniformData[1] = camera.altitude;
			constellationUniformData[2] = camera.fov;
			constellationUniformData[3] = this.canvas.width / this.canvas.height;
			constellationUniformData[4] = TOKYO_LATITUDE_RAD;
			constellationUniformData[5] = lst;
			constellationUniformData[6] = CONSTELLATION_LINE_WIDTH;
			constellationUniformData[7] = CONSTELLATION_LINE_ALPHA;
			constellationUniformData[8] = MIN_FOV;
			constellationUniformData[9] = MAX_FOV;
			constellationUniformData[10] = MAX_CAMERA_OFFSET;
			constellationUniformData[11] = 0; // padding
			this.device.queue.writeBuffer(
				this.constellationUniformBuffer,
				0,
				constellationUniformData,
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

		// Pass 1.5: 星座線を描画（星の背後に表示）
		if (
			this.showConstellations &&
			this.constellationBuffer &&
			this.constellationBindGroup &&
			this.constellationLineCount > 0
		) {
			const constellationPass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: this.textures!.sceneView,
						loadOp: "load", // 背景を保持
						storeOp: "store",
					},
				],
			});
			constellationPass.setPipeline(this.pipelines!.constellation);
			constellationPass.setBindGroup(0, this.constellationBindGroup);
			constellationPass.setVertexBuffer(0, this.constellationBuffer);
			constellationPass.draw(6, this.constellationLineCount);
			constellationPass.end();
		}

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

		// Pass 4-5: ガウシアンブラー
		encodeBlurPasses(
			commandEncoder,
			this.pipelines!,
			this.textures!,
			this.blurResources!,
			BLOOM_ITERATIONS,
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
		this.constellationBuffer?.destroy();
		this.constellationUniformBuffer?.destroy();
		this.postProcessBindGroups?.backgroundUniformBuffer.destroy();
		this.postProcessBindGroups?.compositeUniformBuffer.destroy();
		this.postProcessBindGroups?.compositeSettingsBuffer.destroy();
		this.postProcessBindGroups?.silhouetteUniformBuffer.destroy();
		destroyRenderTextures(this.textures);
		destroyBlurResources(this.blurResources);
		destroySkylineTexture(this.skylineResources);
		this.device?.destroy();
	}
}
