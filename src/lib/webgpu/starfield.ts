/**
 * WebGPUを使用した星空レンダラー（ブルーム効果付き）
 */

import {
	blurShaderCode,
	brightPassShaderCode,
	compositeShaderCode,
	starShaderCode,
} from "./shaders";

export interface StarfieldMeta {
	starCount: number;
	minMagnitude: number;
	maxMagnitude: number;
	minBV: number;
	maxBV: number;
}

export interface CameraState {
	azimuth: number; // 方位角 (ラジアン)
	altitude: number; // 高度角 (ラジアン)
	fov: number; // 視野角 (ラジアン)
}

// 東京の緯度・経度
const TOKYO_LATITUDE = 35.6895; // 度
const TOKYO_LONGITUDE = 139.6917; // 度

export class StarfieldRenderer {
	private device: GPUDevice | null = null;
	private context: GPUCanvasContext | null = null;
	private format: GPUTextureFormat = "bgra8unorm";

	// 星描画パイプライン
	private starPipeline: GPURenderPipeline | null = null;
	private starBuffer: GPUBuffer | null = null;
	private uniformBuffer: GPUBuffer | null = null;
	private starBindGroup: GPUBindGroup | null = null;

	// ポストプロセス用
	private brightPassPipeline: GPURenderPipeline | null = null;
	private blurPipeline: GPURenderPipeline | null = null;
	private compositePipeline: GPURenderPipeline | null = null;

	// テクスチャとサンプラー
	private sceneTexture: GPUTexture | null = null;
	private sceneTextureView: GPUTextureView | null = null;
	private bloomTextures: GPUTexture[] = [];
	private bloomTextureViews: GPUTextureView[] = [];
	private sampler: GPUSampler | null = null;

	// ブラー用
	private blurUniformBuffers: GPUBuffer[] = [];
	private blurBindGroups: GPUBindGroup[] = [];

	// 合成用
	private brightPassBindGroup: GPUBindGroup | null = null;
	private compositeBindGroup: GPUBindGroup | null = null;

	private starCount = 0;
	private meta: StarfieldMeta | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private width = 0;
	private height = 0;

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
		this.createPipelines();

		// Uniform buffer作成
		this.uniformBuffer = this.device.createBuffer({
			size: 64,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
	}

	private createPipelines(): void {
		if (!this.device) return;

		// 星描画パイプライン
		const starShaderModule = this.device.createShaderModule({
			label: "Star shader",
			code: starShaderCode,
		});

		this.starPipeline = this.device.createRenderPipeline({
			label: "Star pipeline",
			layout: "auto",
			vertex: {
				module: starShaderModule,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: 16, // 4 floats (ra, dec, mag, bv)
						stepMode: "instance",
						attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }],
					},
				],
			},
			fragment: {
				module: starShaderModule,
				entryPoint: "fragmentMain",
				targets: [
					{
						format: "rgba16float",
						blend: {
							color: {
								srcFactor: "src-alpha",
								dstFactor: "one",
								operation: "add",
							},
							alpha: {
								srcFactor: "one",
								dstFactor: "one",
								operation: "add",
							},
						},
					},
				],
			},
			primitive: {
				topology: "triangle-list",
			},
		});

		// 輝度抽出パイプライン
		const brightPassModule = this.device.createShaderModule({
			label: "Bright pass shader",
			code: brightPassShaderCode,
		});

		this.brightPassPipeline = this.device.createRenderPipeline({
			label: "Bright pass pipeline",
			layout: "auto",
			vertex: {
				module: brightPassModule,
				entryPoint: "vertexMain",
			},
			fragment: {
				module: brightPassModule,
				entryPoint: "fragmentMain",
				targets: [{ format: "rgba16float" }],
			},
			primitive: {
				topology: "triangle-list",
			},
		});

		// ブラーパイプライン
		const blurModule = this.device.createShaderModule({
			label: "Blur shader",
			code: blurShaderCode,
		});

		this.blurPipeline = this.device.createRenderPipeline({
			label: "Blur pipeline",
			layout: "auto",
			vertex: {
				module: blurModule,
				entryPoint: "vertexMain",
			},
			fragment: {
				module: blurModule,
				entryPoint: "fragmentMain",
				targets: [{ format: "rgba16float" }],
			},
			primitive: {
				topology: "triangle-list",
			},
		});

		// 合成パイプライン
		const compositeModule = this.device.createShaderModule({
			label: "Composite shader",
			code: compositeShaderCode,
		});

		this.compositePipeline = this.device.createRenderPipeline({
			label: "Composite pipeline",
			layout: "auto",
			vertex: {
				module: compositeModule,
				entryPoint: "vertexMain",
			},
			fragment: {
				module: compositeModule,
				entryPoint: "fragmentMain",
				targets: [{ format: this.format }],
			},
			primitive: {
				topology: "triangle-list",
			},
		});
	}

	private createRenderTextures(): void {
		if (!this.device || !this.canvas) return;

		this.width = this.canvas.width;
		this.height = this.canvas.height;

		// 古いテクスチャを破棄
		this.sceneTexture?.destroy();
		for (const tex of this.bloomTextures) {
			tex.destroy();
		}

		// シーンテクスチャ（フル解像度）
		this.sceneTexture = this.device.createTexture({
			size: { width: this.width, height: this.height },
			format: "rgba16float",
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});
		this.sceneTextureView = this.sceneTexture.createView();

		// ブルーム用テクスチャ（半分の解像度で2枚：ping-pong用）
		const bloomWidth = Math.floor(this.width / 2);
		const bloomHeight = Math.floor(this.height / 2);

		this.bloomTextures = [];
		this.bloomTextureViews = [];

		for (let i = 0; i < 2; i += 1) {
			const tex = this.device.createTexture({
				size: { width: bloomWidth, height: bloomHeight },
				format: "rgba16float",
				usage:
					GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
			});
			this.bloomTextures.push(tex);
			this.bloomTextureViews.push(tex.createView());
		}

		// ブラー用Uniformバッファとバインドグループを更新
		this.updateBlurBindGroups(bloomWidth, bloomHeight);
		this.updatePostProcessBindGroups();
	}

	private updateBlurBindGroups(width: number, height: number): void {
		if (
			!this.device ||
			!this.blurPipeline ||
			!this.sampler ||
			this.bloomTextureViews.length < 2
		)
			return;

		// 古いバッファを破棄
		for (const buf of this.blurUniformBuffers) {
			buf.destroy();
		}

		this.blurUniformBuffers = [];
		this.blurBindGroups = [];

		const texelSize = [1 / width, 1 / height];

		// 水平ブラー (texture 0 -> texture 1)
		const hBlurBuffer = this.device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(
			hBlurBuffer,
			0,
			new Float32Array([1, 0, texelSize[0] ?? 0, texelSize[1] ?? 0]),
		);
		this.blurUniformBuffers.push(hBlurBuffer);

		const hBlurBindGroup = this.device.createBindGroup({
			layout: this.blurPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: this.bloomTextureViews[0]! },
				{ binding: 1, resource: this.sampler },
				{ binding: 2, resource: { buffer: hBlurBuffer } },
			],
		});
		this.blurBindGroups.push(hBlurBindGroup);

		// 垂直ブラー (texture 1 -> texture 0)
		const vBlurBuffer = this.device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.device.queue.writeBuffer(
			vBlurBuffer,
			0,
			new Float32Array([0, 1, texelSize[0] ?? 0, texelSize[1] ?? 0]),
		);
		this.blurUniformBuffers.push(vBlurBuffer);

		const vBlurBindGroup = this.device.createBindGroup({
			layout: this.blurPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: this.bloomTextureViews[1]! },
				{ binding: 1, resource: this.sampler },
				{ binding: 2, resource: { buffer: vBlurBuffer } },
			],
		});
		this.blurBindGroups.push(vBlurBindGroup);
	}

	private updatePostProcessBindGroups(): void {
		if (
			!this.device ||
			!this.brightPassPipeline ||
			!this.compositePipeline ||
			!this.sampler ||
			!this.sceneTextureView ||
			this.bloomTextureViews.length === 0
		)
			return;

		// 輝度抽出用バインドグループ
		this.brightPassBindGroup = this.device.createBindGroup({
			layout: this.brightPassPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: this.sceneTextureView },
				{ binding: 1, resource: this.sampler },
			],
		});

		// 合成用バインドグループ
		this.compositeBindGroup = this.device.createBindGroup({
			layout: this.compositePipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: this.sceneTextureView },
				{ binding: 1, resource: this.bloomTextureViews[0]! },
				{ binding: 2, resource: this.sampler },
			],
		});
	}

	async loadStarData(): Promise<void> {
		if (!this.device || !this.starPipeline || !this.uniformBuffer) {
			throw new Error("レンダラーが初期化されていません");
		}

		// メタデータ読み込み
		const metaResponse = await fetch("/stars-meta.json");
		this.meta = (await metaResponse.json()) as StarfieldMeta;
		this.starCount = this.meta.starCount;

		// バイナリデータ読み込み
		const dataResponse = await fetch("/stars.bin");
		const arrayBuffer = await dataResponse.arrayBuffer();

		// 星データバッファ作成
		this.starBuffer = this.device.createBuffer({
			size: arrayBuffer.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});

		this.device.queue.writeBuffer(
			this.starBuffer,
			0,
			new Float32Array(arrayBuffer),
		);

		// 星描画用バインドグループ作成
		this.starBindGroup = this.device.createBindGroup({
			layout: this.starPipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: { buffer: this.uniformBuffer },
				},
			],
		});
	}

	private isRenderReady(): boolean {
		return Boolean(
			this.device &&
			this.context &&
			this.starPipeline &&
			this.starBuffer &&
			this.uniformBuffer &&
			this.starBindGroup &&
			this.canvas &&
			this.meta,
		);
	}

	private isPostProcessReady(): boolean {
		return Boolean(
			this.sceneTextureView &&
			this.brightPassPipeline &&
			this.blurPipeline &&
			this.compositePipeline &&
			this.brightPassBindGroup &&
			this.compositeBindGroup &&
			this.blurBindGroups.length >= 2 &&
			this.bloomTextureViews.length >= 2,
		);
	}

	private updateUniforms(camera: CameraState, time: Date): void {
		if (!this.device || !this.uniformBuffer || !this.canvas || !this.meta)
			return;

		const lst = this.calculateLocalSiderealTime(time, TOKYO_LONGITUDE);

		const uniformData = new Float32Array(16);
		uniformData[0] = camera.azimuth;
		uniformData[1] = camera.altitude;
		uniformData[2] = camera.fov;
		uniformData[3] = this.canvas.width / this.canvas.height;
		uniformData[4] = (TOKYO_LATITUDE * Math.PI) / 180;
		uniformData[5] = lst;
		uniformData[6] = this.meta.minMagnitude;
		uniformData[7] = this.meta.maxMagnitude;

		this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
	}

	private encodeBlurPasses(commandEncoder: GPUCommandEncoder): void {
		if (!this.blurPipeline) return;

		const blurIterations = 3;
		for (let i = 0; i < blurIterations; i += 1) {
			// 水平ブラー (bloom[0] -> bloom[1])
			const hBlurPass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: this.bloomTextureViews[1]!,
						loadOp: "clear",
						storeOp: "store",
					},
				],
			});
			hBlurPass.setPipeline(this.blurPipeline);
			hBlurPass.setBindGroup(0, this.blurBindGroups[0]);
			hBlurPass.draw(6);
			hBlurPass.end();

			// 垂直ブラー (bloom[1] -> bloom[0])
			const vBlurPass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: this.bloomTextureViews[0]!,
						loadOp: "clear",
						storeOp: "store",
					},
				],
			});
			vBlurPass.setPipeline(this.blurPipeline);
			vBlurPass.setBindGroup(0, this.blurBindGroups[1]);
			vBlurPass.draw(6);
			vBlurPass.end();
		}
	}

	render(camera: CameraState, time: Date): void {
		if (!this.isRenderReady()) return;

		// キャンバスサイズが変わったらテクスチャを再作成
		if (
			this.canvas!.width !== this.width ||
			this.canvas!.height !== this.height
		) {
			this.createRenderTextures();
		}

		if (!this.isPostProcessReady()) return;

		this.updateUniforms(camera, time);

		const commandEncoder = this.device!.createCommandEncoder();

		// Pass 1: 星をオフスクリーンテクスチャに描画
		const starPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.sceneTextureView!,
					clearValue: { r: 0, g: 0, b: 0.01, a: 1 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		starPass.setPipeline(this.starPipeline!);
		starPass.setBindGroup(0, this.starBindGroup);
		starPass.setVertexBuffer(0, this.starBuffer);
		starPass.draw(6, this.starCount);
		starPass.end();

		// Pass 2: 輝度抽出（シーン -> bloom[0]）
		const brightPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.bloomTextureViews[0]!,
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		brightPass.setPipeline(this.brightPassPipeline!);
		brightPass.setBindGroup(0, this.brightPassBindGroup);
		brightPass.draw(6);
		brightPass.end();

		// Pass 3-4: ガウシアンブラー
		this.encodeBlurPasses(commandEncoder);

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
		compositePass.setPipeline(this.compositePipeline!);
		compositePass.setBindGroup(0, this.compositeBindGroup);
		compositePass.draw(6);
		compositePass.end();

		this.device!.queue.submit([commandEncoder.finish()]);
	}

	/**
	 * 地方恒星時を計算
	 */
	private calculateLocalSiderealTime(date: Date, longitude: number): number {
		const jd =
			date.getTime() / 86_400_000 +
			2_440_587.5 +
			date.getTimezoneOffset() / 1440;
		const jd2000 = jd - 2_451_545;

		const gmst =
			(280.460_618_37 +
				360.985_647_366_29 * jd2000 +
				0.000_387_933 * Math.pow(jd2000 / 36_525, 2)) %
			360;

		const lst = ((gmst + longitude) * Math.PI) / 180;
		return lst;
	}

	/**
	 * 方位角から方角名を取得
	 */
	getDirectionName(azimuth: number): string {
		let deg = ((azimuth * 180) / Math.PI) % 360;
		if (deg < 0) deg += 360;

		const directions = [
			"北",
			"北北東",
			"北東",
			"東北東",
			"東",
			"東南東",
			"南東",
			"南南東",
			"南",
			"南南西",
			"南西",
			"西南西",
			"西",
			"西北西",
			"北西",
			"北北西",
		];

		const index = Math.round(deg / 22.5) % 16;
		return directions[index] ?? "不明";
	}

	dispose(): void {
		this.starBuffer?.destroy();
		this.uniformBuffer?.destroy();
		this.sceneTexture?.destroy();
		for (const tex of this.bloomTextures) {
			tex.destroy();
		}
		for (const buf of this.blurUniformBuffers) {
			buf.destroy();
		}
		this.device?.destroy();
	}
}
