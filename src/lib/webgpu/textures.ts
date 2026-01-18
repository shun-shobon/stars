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
	/**
	 * ブルームテクスチャの実際の幅
	 */
	bloomWidth: number;
	/**
	 * ブルームテクスチャの実際の高さ
	 */
	bloomHeight: number;
}

/**
 * レンダリング用テクスチャを作成
 *
 * @param device GPUデバイス
 * @param width キャンバス幅
 * @param height キャンバス高さ
 * @param bloomResolutionScale ブルームテクスチャの解像度スケール（デフォルト: 0.5 = 半分）
 */
export function createRenderTextures(
	device: GPUDevice,
	width: number,
	height: number,
	bloomResolutionScale = 0.5,
): RenderTextures {
	// シーンテクスチャ（フル解像度）
	const scene = device.createTexture({
		size: { width, height },
		format: "rgba16float",
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
	});
	const sceneView = scene.createView();

	// ブルーム用テクスチャ（指定スケールの解像度で2枚：ping-pong用）
	// 最小サイズを保証（1以上）
	const bloomWidth = Math.max(1, Math.floor(width * bloomResolutionScale));
	const bloomHeight = Math.max(1, Math.floor(height * bloomResolutionScale));

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

	return {
		scene,
		sceneView,
		bloom,
		bloomViews,
		width,
		height,
		bloomWidth,
		bloomHeight,
	};
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
