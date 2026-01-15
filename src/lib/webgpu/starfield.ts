/**
 * WebGPUを使用した星空レンダラー
 */

import { shaderCode } from "./shaders";

export interface StarfieldMeta {
	starCount: number;
	minMagnitude: number;
	maxMagnitude: number;
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
	private pipeline: GPURenderPipeline | null = null;
	private starBuffer: GPUBuffer | null = null;
	private uniformBuffer: GPUBuffer | null = null;
	private bindGroup: GPUBindGroup | null = null;
	private starCount = 0;
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

		const format = navigator.gpu.getPreferredCanvasFormat();
		this.context.configure({
			device: this.device,
			format,
			alphaMode: "opaque",
		});

		// シェーダーモジュール作成
		const shaderModule = this.device.createShaderModule({
			label: "Star shader",
			code: shaderCode,
		});

		// パイプライン作成
		this.pipeline = this.device.createRenderPipeline({
			label: "Star pipeline",
			layout: "auto",
			vertex: {
				module: shaderModule,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: 12, // 3 floats (ra, dec, mag)
						stepMode: "instance",
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x3" }, // ra, dec, mag
						],
					},
				],
			},
			fragment: {
				module: shaderModule,
				entryPoint: "fragmentMain",
				targets: [
					{
						format,
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

		// Uniform buffer作成
		this.uniformBuffer = this.device.createBuffer({
			size: 64, // mat4x4 + extras
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
	}

	async loadStarData(): Promise<void> {
		if (!this.device || !this.pipeline || !this.uniformBuffer) {
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

		// Bind group作成
		this.bindGroup = this.device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: { buffer: this.uniformBuffer },
				},
			],
		});
	}

	render(camera: CameraState, time: Date): void {
		if (
			!this.device ||
			!this.context ||
			!this.pipeline ||
			!this.starBuffer ||
			!this.uniformBuffer ||
			!this.bindGroup ||
			!this.canvas ||
			!this.meta
		) {
			return;
		}

		// 恒星時の計算 (地方恒星時)
		const lst = this.calculateLocalSiderealTime(time, TOKYO_LONGITUDE);

		// Uniform データ更新
		const uniformData = new Float32Array(16);
		uniformData[0] = camera.azimuth;
		uniformData[1] = camera.altitude;
		uniformData[2] = camera.fov;
		uniformData[3] = this.canvas.width / this.canvas.height; // アスペクト比
		uniformData[4] = (TOKYO_LATITUDE * Math.PI) / 180; // 観測地の緯度 (ラジアン)
		uniformData[5] = lst; // 地方恒星時 (ラジアン)
		uniformData[6] = this.meta.minMagnitude;
		uniformData[7] = this.meta.maxMagnitude;

		this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

		const commandEncoder = this.device.createCommandEncoder();
		const textureView = this.context.getCurrentTexture().createView();

		const renderPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: textureView,
					clearValue: { r: 0, g: 0, b: 0.02, a: 1 }, // 深い藍色の夜空
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});

		renderPass.setPipeline(this.pipeline);
		renderPass.setBindGroup(0, this.bindGroup);
		renderPass.setVertexBuffer(0, this.starBuffer);
		renderPass.draw(6, this.starCount); // 6 vertices per quad, instanced
		renderPass.end();

		this.device.queue.submit([commandEncoder.finish()]);
	}

	/**
	 * 地方恒星時を計算
	 */
	private calculateLocalSiderealTime(date: Date, longitude: number): number {
		// ユリウス日の計算
		const jd =
			date.getTime() / 86_400_000 +
			2_440_587.5 +
			date.getTimezoneOffset() / 1440;
		const jd2000 = jd - 2_451_545;

		// グリニッジ恒星時 (度)
		const gmst =
			(280.460_618_37 +
				360.985_647_366_29 * jd2000 +
				0.000_387_933 * Math.pow(jd2000 / 36_525, 2)) %
			360;

		// 地方恒星時 (度 -> ラジアン)
		const lst = ((gmst + longitude) * Math.PI) / 180;
		return lst;
	}

	/**
	 * 方位角と高度角から方角名を取得
	 */
	getDirectionName(azimuth: number): string {
		// 方位角を0-360度に正規化
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
		this.device?.destroy();
	}
}
