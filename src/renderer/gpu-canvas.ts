export class GpuUnavailableError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "GpuUnavailableError";
	}
}

export class GpuDeviceLostError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "GpuDeviceLostError";
	}
}

/** 描画コマンドの検証エラーのように、GPU が処理を拒否したことを表す */
export class GpuValidationError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "GpuValidationError";
	}
}

export type GpuCanvas = {
	device: GPUDevice;
	context: GPUCanvasContext;
	format: GPUTextureFormat;
	/** HDR ディスプレイへ広い輝度範囲で出力するか */
	isHdr: boolean;
};

const HDR_CANVAS_FORMAT: GPUTextureFormat = "rgba16float";

/**
 * GPU デバイスを取得し、表示先のディスプレイに合わせて canvas を構成する。
 */
export async function setUpGpuCanvas(
	canvas: HTMLCanvasElement,
	signal: AbortSignal,
): Promise<GpuCanvas> {
	const adapter = await navigator.gpu.requestAdapter();
	if (adapter == null) {
		throw new GpuUnavailableError("No GPU adapter is available.");
	}

	const device = await adapter.requestDevice();
	try {
		// 同じ canvas の context は共有されるため、中断された初期化が後から構成すると現役の構成を上書きしてしまう
		signal.throwIfAborted();

		const context = canvas.getContext("webgpu");
		if (context == null) {
			throw new GpuUnavailableError("Failed to get a WebGPU canvas context.");
		}

		const isHdr = matchMedia("(dynamic-range: high)").matches;
		const format = isHdr ? HDR_CANVAS_FORMAT : navigator.gpu.getPreferredCanvasFormat();
		context.configure(
			isHdr
				? {
						device,
						format,
						alphaMode: "opaque",
						colorSpace: "display-p3",
						toneMapping: { mode: "extended" },
					}
				: { device, format, alphaMode: "opaque" },
		);

		return { device, context, format, isHdr };
	} catch (error) {
		device.destroy();
		throw error;
	}
}
