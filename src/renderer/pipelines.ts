import { CONSTELLATION_LINE_RECORD_BYTES, STAR_RECORD_BYTES } from "~/domain/catalog-format";

import { BACKGROUND_WGSL } from "./shaders/background.wgsl";
import { BLUR_WGSL } from "./shaders/blur.wgsl";
import { BRIGHT_PASS_WGSL } from "./shaders/bright-pass.wgsl";
import { COMPOSITE_WGSL } from "./shaders/composite.wgsl";
import { CONSTELLATION_WGSL } from "./shaders/constellation.wgsl";
import { STAR_WGSL } from "./shaders/star.wgsl";

/** 合成前のシーンとブルームは、星の明るさが 1 を超えても潰れないよう浮動小数点で持つ */
export const HDR_TEXTURE_FORMAT: GPUTextureFormat = "rgba16float";

export type Pipelines = {
	background: GPURenderPipeline;
	constellation: GPURenderPipeline;
	star: GPURenderPipeline;
	brightPass: GPURenderPipeline;
	blurHorizontal: GPURenderPipeline;
	blurVertical: GPURenderPipeline;
	composite: GPURenderPipeline;
};

type CreatePipelinesOptions = {
	canvasFormat: GPUTextureFormat;
	isHdr: boolean;
	faintestMagnitude: number;
};

const ALPHA_BLEND: GPUBlendState = {
	color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
	alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

/** 重なった星の光を足し合わせる */
const ADDITIVE_BLEND: GPUBlendState = {
	color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
	alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
};

export function createPipelines(
	device: GPUDevice,
	{ canvasFormat, isHdr, faintestMagnitude }: CreatePipelinesOptions,
): Pipelines {
	const blurModule = device.createShaderModule({ label: "Blur", code: BLUR_WGSL });

	return {
		background: createFullscreenPipeline(device, {
			label: "Background",
			module: device.createShaderModule({ label: "Background", code: BACKGROUND_WGSL }),
			format: HDR_TEXTURE_FORMAT,
		}),
		constellation: createInstancedQuadPipeline(device, {
			label: "Constellation",
			module: device.createShaderModule({ label: "Constellation", code: CONSTELLATION_WGSL }),
			recordBytes: CONSTELLATION_LINE_RECORD_BYTES,
			blend: ALPHA_BLEND,
			constants: {},
		}),
		star: createInstancedQuadPipeline(device, {
			label: "Star",
			module: device.createShaderModule({ label: "Star", code: STAR_WGSL }),
			recordBytes: STAR_RECORD_BYTES,
			blend: ADDITIVE_BLEND,
			constants: { FAINTEST_MAGNITUDE: faintestMagnitude },
		}),
		brightPass: createFullscreenPipeline(device, {
			label: "Bright pass",
			module: device.createShaderModule({ label: "Bright pass", code: BRIGHT_PASS_WGSL }),
			format: HDR_TEXTURE_FORMAT,
		}),
		blurHorizontal: createFullscreenPipeline(device, {
			label: "Blur horizontal",
			module: blurModule,
			format: HDR_TEXTURE_FORMAT,
			constants: { IS_HORIZONTAL: 1 },
		}),
		blurVertical: createFullscreenPipeline(device, {
			label: "Blur vertical",
			module: blurModule,
			format: HDR_TEXTURE_FORMAT,
			constants: { IS_HORIZONTAL: 0 },
		}),
		composite: createFullscreenPipeline(device, {
			label: "Composite",
			module: device.createShaderModule({ label: "Composite", code: COMPOSITE_WGSL }),
			format: canvasFormat,
			// HDR では表示側に輝度の余裕があるため、露出とブルームを控えめにする
			constants: isHdr
				? { IS_HDR: 1, EXPOSURE: 1, BLOOM_STRENGTH: 1.5 }
				: { IS_HDR: 0, EXPOSURE: 1.2, BLOOM_STRENGTH: 2 },
		}),
	};
}

function createFullscreenPipeline(
	device: GPUDevice,
	options: {
		label: string;
		module: GPUShaderModule;
		format: GPUTextureFormat;
		constants?: Record<string, number>;
	},
): GPURenderPipeline {
	return device.createRenderPipeline({
		label: options.label,
		layout: "auto",
		vertex: { module: options.module },
		fragment: {
			module: options.module,
			targets: [{ format: options.format }],
			constants: options.constants ?? {},
		},
		primitive: { topology: "triangle-list" },
	});
}

function createInstancedQuadPipeline(
	device: GPUDevice,
	options: {
		label: string;
		module: GPUShaderModule;
		recordBytes: number;
		blend: GPUBlendState;
		constants: Record<string, number>;
	},
): GPURenderPipeline {
	return device.createRenderPipeline({
		label: options.label,
		layout: "auto",
		vertex: {
			module: options.module,
			buffers: [
				{
					arrayStride: options.recordBytes,
					stepMode: "instance",
					attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }],
				},
			],
			constants: options.constants,
		},
		fragment: {
			module: options.module,
			targets: [{ format: HDR_TEXTURE_FORMAT, blend: options.blend }],
		},
		primitive: { topology: "triangle-strip" },
	});
}
