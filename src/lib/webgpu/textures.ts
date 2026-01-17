/**
 * WebGPUテクスチャ管理
 */

export interface RenderTextures {
	scene: GPUTexture;
	sceneView: GPUTextureView;
	bloom: GPUTexture[];
	bloomViews: GPUTextureView[];
	width: number;
	height: number;
}

/**
 * レンダリング用テクスチャを作成
 */
export function createRenderTextures(
	device: GPUDevice,
	width: number,
	height: number,
): RenderTextures {
	// シーンテクスチャ（フル解像度）
	const scene = device.createTexture({
		size: { width, height },
		format: "rgba16float",
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
	});
	const sceneView = scene.createView();

	// ブルーム用テクスチャ（半分の解像度で2枚：ping-pong用）
	const bloomWidth = Math.floor(width / 2);
	const bloomHeight = Math.floor(height / 2);

	const bloom: GPUTexture[] = [];
	const bloomViews: GPUTextureView[] = [];

	for (let i = 0; i < 2; i += 1) {
		const tex = device.createTexture({
			size: { width: bloomWidth, height: bloomHeight },
			format: "rgba16float",
			usage:
				GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});
		bloom.push(tex);
		bloomViews.push(tex.createView());
	}

	return { scene, sceneView, bloom, bloomViews, width, height };
}

/**
 * テクスチャを破棄
 */
export function destroyRenderTextures(textures: RenderTextures | null): void {
	if (!textures) return;
	textures.scene.destroy();
	for (const tex of textures.bloom) {
		tex.destroy();
	}
}
