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

		type Vec3 = [number, number, number];

		const horizontalToCartesian = (azimuth: number, altitude: number): Vec3 => {
			const cosAlt = Math.cos(altitude);
			return [
				cosAlt * Math.sin(azimuth),
				Math.sin(altitude),
				cosAlt * Math.cos(azimuth),
			] as Vec3;
		};
		const cross = (a: Vec3, b: Vec3): Vec3 =>
			[
				a[1] * b[2] - a[2] * b[1],
				a[2] * b[0] - a[0] * b[2],
				a[0] * b[1] - a[1] * b[0],
			] as Vec3;
		const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
		const normalize = (v: Vec3): Vec3 => {
			const len = length(v);
			if (len === 0) return [0, 0, 0];
			return [v[0] / len, v[1] / len, v[2] / len] as Vec3;
		};
		const calculateCameraOffset = (
			fov: number,
			minFov: number,
			maxFov: number,
			maxOffset: number,
		) => {
			const t = Math.max(0, Math.min(1, (fov - minFov) / (maxFov - minFov)));
			return maxOffset * t;
		};

		const aspect = this.canvas.width / this.canvas.height;
		const viewDir = normalize(
			horizontalToCartesian(camera.azimuth, camera.altitude),
		);
		const worldUp: Vec3 = [0, 1, 0];
		let right = cross(worldUp, viewDir);
		right = length(right) < 0.001 ? [1, 0, 0] : normalize(right);
		const up = normalize(cross(viewDir, right));
		const cameraOffset = calculateCameraOffset(
			camera.fov,
			MIN_FOV,
			MAX_FOV,
			MAX_CAMERA_OFFSET,
		);
		const cameraPos: Vec3 = [
			-viewDir[0] * cameraOffset,
			-viewDir[1] * cameraOffset,
			-viewDir[2] * cameraOffset,
		];
		const tanHalfFov = Math.tan(camera.fov * 0.5);
		const projScale = 1 / tanHalfFov;
		const diagonalFactor = Math.sqrt(1 + aspect * aspect);
		const cullRadius = camera.fov * 0.5 * diagonalFactor * 1.1;

		// 星シェーダー用Uniform（24 floats）
		const uniformData = new Float32Array(24);
		uniformData[0] = viewDir[0];
		uniformData[1] = viewDir[1];
		uniformData[2] = viewDir[2];
		uniformData[3] = 0; // padding
		uniformData[4] = right[0];
		uniformData[5] = right[1];
		uniformData[6] = right[2];
		uniformData[7] = 0; // padding
		uniformData[8] = up[0];
		uniformData[9] = up[1];
		uniformData[10] = up[2];
		uniformData[11] = 0; // padding
		uniformData[12] = cameraPos[0];
		uniformData[13] = cameraPos[1];
		uniformData[14] = cameraPos[2];
		uniformData[15] = 0; // padding
		uniformData[16] = projScale;
		uniformData[17] = aspect;
		uniformData[18] = cullRadius;
		uniformData[19] = 0; // padding
		uniformData[20] = TOKYO_LATITUDE_RAD;
		uniformData[21] = lst;
		uniformData[22] = this.meta.minMagnitude;
		uniformData[23] = this.meta.maxMagnitude;

		this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

		// 共通のカメラuniformデータ（background, composite用）
		const cameraUniformData = new Float32Array(20);
		cameraUniformData[0] = viewDir[0];
		cameraUniformData[1] = viewDir[1];
		cameraUniformData[2] = viewDir[2];
		cameraUniformData[3] = 0; // padding
		cameraUniformData[4] = right[0];
		cameraUniformData[5] = right[1];
		cameraUniformData[6] = right[2];
		cameraUniformData[7] = 0; // padding
		cameraUniformData[8] = up[0];
		cameraUniformData[9] = up[1];
		cameraUniformData[10] = up[2];
		cameraUniformData[11] = 0; // padding
		cameraUniformData[12] = cameraPos[0];
		cameraUniformData[13] = cameraPos[1];
		cameraUniformData[14] = cameraPos[2];
		cameraUniformData[15] = 0; // padding
		cameraUniformData[16] = tanHalfFov;
		cameraUniformData[17] = aspect;
		cameraUniformData[18] = 0; // padding
		cameraUniformData[19] = 0; // padding

		const postProcess = this.postProcessBindGroups;
		if (postProcess) {
			const cameraUniformBuffer: GPUBuffer = postProcess.cameraUniformBuffer;
			this.device.queue.writeBuffer(cameraUniformBuffer, 0, cameraUniformData);

			// composite設定uniform更新（HDR/SDR切替）
			const compositeSettings = new Float32Array(4);
			compositeSettings[0] = this.hdrConfig.toneMappingMode; // トーンマッピングモード
			compositeSettings[1] = this.hdrConfig.enabled ? 1 : 1.2; // 露出（HDR時は低め）
			compositeSettings[2] = this.hdrConfig.enabled ? 1.5 : 2; // ブルーム強度（HDR時は控えめ）
			compositeSettings[3] = 0; // padding
			this.device.queue.writeBuffer(
				postProcess.compositeSettingsBuffer,
				0,
				compositeSettings,
			);
		}

		// 星座線用uniform更新
		if (this.constellationUniformBuffer) {
			const constellationUniformData = new Float32Array(24);
			constellationUniformData[0] = viewDir[0];
			constellationUniformData[1] = viewDir[1];
			constellationUniformData[2] = viewDir[2];
			constellationUniformData[3] = 0; // padding
			constellationUniformData[4] = right[0];
			constellationUniformData[5] = right[1];
			constellationUniformData[6] = right[2];
			constellationUniformData[7] = 0; // padding
			constellationUniformData[8] = up[0];
			constellationUniformData[9] = up[1];
			constellationUniformData[10] = up[2];
			constellationUniformData[11] = 0; // padding
			constellationUniformData[12] = cameraPos[0];
			constellationUniformData[13] = cameraPos[1];
			constellationUniformData[14] = cameraPos[2];
			constellationUniformData[15] = 0; // padding
			constellationUniformData[16] = projScale;
			constellationUniformData[17] = aspect;
			constellationUniformData[18] = cullRadius;
			constellationUniformData[19] = 0; // padding
			constellationUniformData[20] = TOKYO_LATITUDE_RAD;
			constellationUniformData[21] = lst;
			constellationUniformData[22] = CONSTELLATION_LINE_WIDTH;
			constellationUniformData[23] = CONSTELLATION_LINE_ALPHA;
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
			constellationPass.draw(4, this.constellationLineCount);
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
		starPass.draw(4, this.loadedStarCount);
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
		this.postProcessBindGroups?.cameraUniformBuffer.destroy();
		this.postProcessBindGroups?.compositeSettingsBuffer.destroy();
		destroyRenderTextures(this.textures);
		destroyBlurResources(this.blurResources);
		destroySkylineTexture(this.skylineResources);
		this.device?.destroy();
	}
}
