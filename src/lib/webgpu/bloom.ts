/**
 * ブルーム効果処理
 */

import { BLOOM_ITERATIONS } from "~/constants";

import type { Pipelines } from "./pipelines";
import type { RenderTextures } from "./textures";

export interface BlurResources {
	uniformBuffers: GPUBuffer[];
	bindGroups: GPUBindGroup[];
}

export interface PostProcessBindGroups {
	background: GPUBindGroup;
	backgroundUniformBuffer: GPUBuffer;
	brightPass: GPUBindGroup;
	composite: GPUBindGroup;
	compositeUniformBuffer: GPUBuffer;
	silhouette: GPUBindGroup;
	silhouetteUniformBuffer: GPUBuffer;
}

/**
 * ブラー用リソースを作成
 */
export function createBlurResources(
	device: GPUDevice,
	pipelines: Pipelines,
	textures: RenderTextures,
	sampler: GPUSampler,
): BlurResources {
	const bloomWidth = Math.floor(textures.width / 2);
	const bloomHeight = Math.floor(textures.height / 2);
	const texelSize = [1 / bloomWidth, 1 / bloomHeight];

	const uniformBuffers: GPUBuffer[] = [];
	const bindGroups: GPUBindGroup[] = [];

	// 水平ブラー (texture 0 -> texture 1)
	const hBlurBuffer = device.createBuffer({
		size: 16,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(
		hBlurBuffer,
		0,
		new Float32Array([1, 0, texelSize[0] ?? 0, texelSize[1] ?? 0]),
	);
	uniformBuffers.push(hBlurBuffer);

	const hBlurBindGroup = device.createBindGroup({
		layout: pipelines.blur.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: textures.bloomViews[0]! },
			{ binding: 1, resource: sampler },
			{ binding: 2, resource: { buffer: hBlurBuffer } },
		],
	});
	bindGroups.push(hBlurBindGroup);

	// 垂直ブラー (texture 1 -> texture 0)
	const vBlurBuffer = device.createBuffer({
		size: 16,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(
		vBlurBuffer,
		0,
		new Float32Array([0, 1, texelSize[0] ?? 0, texelSize[1] ?? 0]),
	);
	uniformBuffers.push(vBlurBuffer);

	const vBlurBindGroup = device.createBindGroup({
		layout: pipelines.blur.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: textures.bloomViews[1]! },
			{ binding: 1, resource: sampler },
			{ binding: 2, resource: { buffer: vBlurBuffer } },
		],
	});
	bindGroups.push(vBlurBindGroup);

	return { uniformBuffers, bindGroups };
}

/**
 * ポストプロセス用バインドグループを作成
 */
export function createPostProcessBindGroups(
	device: GPUDevice,
	pipelines: Pipelines,
	textures: RenderTextures,
	sampler: GPUSampler,
): PostProcessBindGroups {
	// 背景用uniformバッファ（カメラ情報：altitude, fov, aspect, azimuth）
	const backgroundUniformBuffer = device.createBuffer({
		size: 16, // 4 floats
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// 背景用バインドグループ
	const background = device.createBindGroup({
		layout: pipelines.background.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: backgroundUniformBuffer } }],
	});

	// 輝度抽出用バインドグループ
	const brightPass = device.createBindGroup({
		layout: pipelines.brightPass.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: textures.sceneView },
			{ binding: 1, resource: sampler },
		],
	});

	// 合成用uniformバッファ（カメラ情報：altitude, fov, aspect, padding）
	const compositeUniformBuffer = device.createBuffer({
		size: 16, // 4 floats
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// 合成用バインドグループ
	const composite = device.createBindGroup({
		layout: pipelines.composite.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: textures.sceneView },
			{ binding: 1, resource: textures.bloomViews[0]! },
			{ binding: 2, resource: sampler },
		],
	});

	// シルエット用uniformバッファ（カメラ情報：altitude, fov, aspect, azimuth）
	const silhouetteUniformBuffer = device.createBuffer({
		size: 16, // 4 floats
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// シルエット用バインドグループ
	const silhouette = device.createBindGroup({
		layout: pipelines.silhouette.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: silhouetteUniformBuffer } }],
	});

	return {
		background,
		backgroundUniformBuffer,
		brightPass,
		composite,
		compositeUniformBuffer,
		silhouette,
		silhouetteUniformBuffer,
	};
}

/**
 * ブラー用リソースを破棄
 */
export function destroyBlurResources(resources: BlurResources | null): void {
	if (!resources) return;
	for (const buf of resources.uniformBuffers) {
		buf.destroy();
	}
}

/**
 * ブラーパスをエンコード
 */
export function encodeBlurPasses(
	commandEncoder: GPUCommandEncoder,
	pipelines: Pipelines,
	textures: RenderTextures,
	blurResources: BlurResources,
): void {
	for (let i = 0; i < BLOOM_ITERATIONS; i += 1) {
		// 水平ブラー (bloom[0] -> bloom[1])
		const hBlurPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: textures.bloomViews[1]!,
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		hBlurPass.setPipeline(pipelines.blur);
		hBlurPass.setBindGroup(0, blurResources.bindGroups[0]);
		hBlurPass.draw(6);
		hBlurPass.end();

		// 垂直ブラー (bloom[1] -> bloom[0])
		const vBlurPass = commandEncoder.beginRenderPass({
			colorAttachments: [
				{
					view: textures.bloomViews[0]!,
					loadOp: "clear",
					storeOp: "store",
				},
			],
		});
		vBlurPass.setPipeline(pipelines.blur);
		vBlurPass.setBindGroup(0, blurResources.bindGroups[1]);
		vBlurPass.draw(6);
		vBlurPass.end();
	}
}
