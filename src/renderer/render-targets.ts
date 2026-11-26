import type { Pipelines } from "./pipelines";
import { HDR_TEXTURE_FORMAT } from "./pipelines";

/** ブルームはぼかすだけなので、半分の解像度で処理して負荷を下げる */
const BLOOM_RESOLUTION_SCALE = 0.5;

/**
 * canvas の解像度に依存するオフスクリーンのテクスチャと、それを読むバインドグループ。
 * ブルームは2枚を交互に読み書きして、縦横のブラーを重ねる。
 */
export type RenderTargets = {
	width: number;
	height: number;
	sceneView: GPUTextureView;
	/** 輝度抽出の書き込み先で、ブラーを重ねた結果もここに戻る */
	bloomView: GPUTextureView;
	/** ブラーの中間結果 */
	bloomScratchView: GPUTextureView;
	brightPassBindGroup: GPUBindGroup;
	blurHorizontalBindGroup: GPUBindGroup;
	blurVerticalBindGroup: GPUBindGroup;
	compositeBindGroup: GPUBindGroup;
	destroy: () => void;
};

type CreateRenderTargetsOptions = {
	device: GPUDevice;
	pipelines: Pipelines;
	sampler: GPUSampler;
	skylineView: GPUTextureView;
	width: number;
	height: number;
};

export function createRenderTargets({
	device,
	pipelines,
	sampler,
	skylineView,
	width,
	height,
}: CreateRenderTargetsOptions): RenderTargets {
	const createTexture = (label: string, textureWidth: number, textureHeight: number): GPUTexture =>
		device.createTexture({
			label,
			size: { width: textureWidth, height: textureHeight },
			format: HDR_TEXTURE_FORMAT,
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});

	const bloomWidth = Math.max(1, Math.floor(width * BLOOM_RESOLUTION_SCALE));
	const bloomHeight = Math.max(1, Math.floor(height * BLOOM_RESOLUTION_SCALE));
	const scene = createTexture("Scene", width, height);
	const bloom = createTexture("Bloom", bloomWidth, bloomHeight);
	const bloomScratch = createTexture("Bloom scratch", bloomWidth, bloomHeight);

	const sceneView = scene.createView();
	const bloomView = bloom.createView();
	const bloomScratchView = bloomScratch.createView();

	const createSamplingBindGroup = (
		pipeline: GPURenderPipeline,
		source: GPUTextureView,
	): GPUBindGroup =>
		device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: source },
				{ binding: 1, resource: sampler },
			],
		});

	return {
		width,
		height,
		sceneView,
		bloomView,
		bloomScratchView,
		brightPassBindGroup: createSamplingBindGroup(pipelines.brightPass, sceneView),
		blurHorizontalBindGroup: createSamplingBindGroup(pipelines.blurHorizontal, bloomView),
		blurVerticalBindGroup: createSamplingBindGroup(pipelines.blurVertical, bloomScratchView),
		compositeBindGroup: device.createBindGroup({
			layout: pipelines.composite.getBindGroupLayout(1),
			entries: [
				{ binding: 0, resource: sceneView },
				{ binding: 1, resource: bloomView },
				{ binding: 2, resource: sampler },
				{ binding: 3, resource: skylineView },
			],
		}),
		destroy: () => {
			scene.destroy();
			bloom.destroy();
			bloomScratch.destroy();
		},
	};
}
