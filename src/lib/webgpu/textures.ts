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

export interface TextureOptions {
	/**
	 * レンダリングテクスチャのフォーマット
	 */
	format: GPUTextureFormat;
	/**
	 * ブルームテクスチャのダウンスケール（1/n）
	 */
	bloomDownscale: number;
}

/**
 * レンダリング用テクスチャを作成
 */
export function createRenderTextures(
	device: GPUDevice,
	width: number,
	height: number,
	options: TextureOptions,
): RenderTextures {
	const { format, bloomDownscale } = options;

	// シーンテクスチャ（フル解像度）
	const scene = device.createTexture({
		size: { width, height },
		format,
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
	});
	const sceneView = scene.createView();

	// ブルーム用テクスチャ（ダウンスケール解像度で2枚：ping-pong用）
	const bloomWidth = Math.floor(width / bloomDownscale);
	const bloomHeight = Math.floor(height / bloomDownscale);

	const bloom: GPUTexture[] = [];
	const bloomViews: GPUTextureView[] = [];

	for (let i = 0; i < 2; i += 1) {
		const tex = device.createTexture({
			size: { width: bloomWidth, height: bloomHeight },
			format,
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
