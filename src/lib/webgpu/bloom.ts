/**
 * ブルーム効果処理
 */

import type { Pipelines } from "./pipelines";
import type { SkylineResources } from "./skyline";
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
	compositeSettingsBuffer: GPUBuffer;
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
	// テクスチャの実際のブルームサイズを使用
	const bloomWidth = textures.bloomWidth;
	const bloomHeight = textures.bloomHeight;
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
	skylineResources: SkylineResources,
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

	// 合成用uniformバッファ（カメラ情報：altitude, fov, aspect, padding）- 現在未使用だが互換性のため保持
	const compositeUniformBuffer = device.createBuffer({
		size: 16, // 4 floats
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// 合成設定用uniformバッファ（toneMappingMode, exposure, bloomStrength, padding）
	const compositeSettingsBuffer = device.createBuffer({
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
			{ binding: 3, resource: { buffer: compositeSettingsBuffer } },
		],
	});

	// シルエット用uniformバッファ（カメラ情報：altitude, fov, aspect, azimuth）
	const silhouetteUniformBuffer = device.createBuffer({
		size: 16, // 4 floats
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// シルエット用バインドグループ（スカイラインテクスチャを含む）
	// r32floatはフィルタリング非対応のためtextureLoadを使用（サンプラー不要）
	const silhouette = device.createBindGroup({
		layout: pipelines.silhouette.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: silhouetteUniformBuffer } },
			{ binding: 1, resource: skylineResources.textureView },
		],
	});

	return {
		background,
		backgroundUniformBuffer,
		brightPass,
		composite,
		compositeUniformBuffer,
		compositeSettingsBuffer,
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
 *
 * @param commandEncoder GPUコマンドエンコーダー
 * @param pipelines パイプライン
 * @param textures テクスチャ
 * @param blurResources ブラーリソース
 * @param iterations ブラーのイテレーション回数（デフォルト: 2）
 */
export function encodeBlurPasses(
	commandEncoder: GPUCommandEncoder,
	pipelines: Pipelines,
	textures: RenderTextures,
	blurResources: BlurResources,
	iterations = 2,
): void {
	for (let i = 0; i < iterations; i += 1) {
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
