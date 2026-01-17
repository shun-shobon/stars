/**
 * WebGPUパイプライン作成
 */

import {
	backgroundShaderCode,
	blur5TapShaderCode,
	blur9TapShaderCode,
	brightPassShaderCode,
	compositeShaderCode,
	silhouetteShaderCode,
	starShaderCode,
} from "./shaders";

export interface Pipelines {
	background: GPURenderPipeline;
	star: GPURenderPipeline;
	brightPass: GPURenderPipeline;
	blur: GPURenderPipeline;
	composite: GPURenderPipeline;
	silhouette: GPURenderPipeline;
}

export interface PipelineOptions {
	/**
	 * キャンバスのテクスチャフォーマット
	 */
	canvasFormat: GPUTextureFormat;
	/**
	 * レンダリングテクスチャのフォーマット
	 */
	renderTextureFormat: GPUTextureFormat;
	/**
	 * ブラーのタップ数
	 */
	blurTaps: 5 | 9;
}

/**
 * 全パイプラインを作成
 */
export function createPipelines(
	device: GPUDevice,
	options: PipelineOptions,
): Pipelines {
	const { canvasFormat, renderTextureFormat, blurTaps } = options;
	// 背景（光害グラデーション）パイプライン
	const backgroundModule = device.createShaderModule({
		label: "Background shader",
		code: backgroundShaderCode,
	});

	const background = device.createRenderPipeline({
		label: "Background pipeline",
		layout: "auto",
		vertex: {
			module: backgroundModule,
			entryPoint: "vertexMain",
		},
		fragment: {
			module: backgroundModule,
			entryPoint: "fragmentMain",
			targets: [{ format: renderTextureFormat }],
		},
		primitive: {
			topology: "triangle-list",
		},
	});

	// 星描画パイプライン
	const starShaderModule = device.createShaderModule({
		label: "Star shader",
		code: starShaderCode,
	});

	const star = device.createRenderPipeline({
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
					format: renderTextureFormat,
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
	const brightPassModule = device.createShaderModule({
		label: "Bright pass shader",
		code: brightPassShaderCode,
	});

	const brightPass = device.createRenderPipeline({
		label: "Bright pass pipeline",
		layout: "auto",
		vertex: {
			module: brightPassModule,
			entryPoint: "vertexMain",
		},
		fragment: {
			module: brightPassModule,
			entryPoint: "fragmentMain",
			targets: [{ format: renderTextureFormat }],
		},
		primitive: {
			topology: "triangle-list",
		},
	});

	// ブラーパイプライン（タップ数に応じて選択）
	const blurShaderCode =
		blurTaps === 5 ? blur5TapShaderCode : blur9TapShaderCode;
	const blurModule = device.createShaderModule({
		label: "Blur shader",
		code: blurShaderCode,
	});

	const blur = device.createRenderPipeline({
		label: "Blur pipeline",
		layout: "auto",
		vertex: {
			module: blurModule,
			entryPoint: "vertexMain",
		},
		fragment: {
			module: blurModule,
			entryPoint: "fragmentMain",
			targets: [{ format: renderTextureFormat }],
		},
		primitive: {
			topology: "triangle-list",
		},
	});

	// 合成パイプライン
	const compositeModule = device.createShaderModule({
		label: "Composite shader",
		code: compositeShaderCode,
	});

	const composite = device.createRenderPipeline({
		label: "Composite pipeline",
		layout: "auto",
		vertex: {
			module: compositeModule,
			entryPoint: "vertexMain",
		},
		fragment: {
			module: compositeModule,
			entryPoint: "fragmentMain",
			targets: [{ format: canvasFormat }],
		},
		primitive: {
			topology: "triangle-list",
		},
	});

	// シルエット（建物スカイライン）パイプライン
	const silhouetteModule = device.createShaderModule({
		label: "Silhouette shader",
		code: silhouetteShaderCode,
	});

	const silhouette = device.createRenderPipeline({
		label: "Silhouette pipeline",
		layout: "auto",
		vertex: {
			module: silhouetteModule,
			entryPoint: "vertexMain",
		},
		fragment: {
			module: silhouetteModule,
			entryPoint: "fragmentMain",
			targets: [{ format: canvasFormat }],
		},
		primitive: {
			topology: "triangle-list",
		},
	});

	return { background, star, brightPass, blur, composite, silhouette };
}
