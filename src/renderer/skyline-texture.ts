import {
	generateSkylineHeights,
	SKYLINE_LAYER_COUNT,
	SKYLINE_TEXTURE_WIDTH,
} from "./skyline-heights";

/**
 * 建物シルエットの高さを、各行が1レイヤーに対応する r32float のテクスチャにする。
 */
export function createSkylineTexture(device: GPUDevice): GPUTexture {
	const size = { width: SKYLINE_TEXTURE_WIDTH, height: SKYLINE_LAYER_COUNT };
	const texture = device.createTexture({
		label: "Skyline",
		size,
		format: "r32float",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
	});

	device.queue.writeTexture(
		{ texture },
		generateSkylineHeights(),
		{ bytesPerRow: SKYLINE_TEXTURE_WIDTH * Float32Array.BYTES_PER_ELEMENT },
		size,
	);

	return texture;
}
