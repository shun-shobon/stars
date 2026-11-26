import type { MilkyWayTile } from "~/domain/milky-way-format";
import { MILKY_WAY_TILE_SIZE, milkyWayTilePath } from "~/domain/milky-way-format";

import { CatalogLoadError, failOnNetworkError, fetchCatalogFile } from "./fetch-catalog-file";

/**
 * 天の川のタイル画像を取得し、GPU に転送できる画像にする。
 * 画素値は sRGB で符号化した放射輝度なので、色空間の変換をかけずにそのまま渡す。
 */
export async function fetchMilkyWayTile(
	tile: MilkyWayTile,
	signal: AbortSignal,
): Promise<ImageBitmap> {
	const path = milkyWayTilePath(tile);
	const response = await fetchCatalogFile(path, signal);
	const blob = await failOnNetworkError(`Failed to read ${path}.`, () => response.blob());

	let image: ImageBitmap;
	try {
		image = await createImageBitmap(blob, {
			colorSpaceConversion: "none",
			premultiplyAlpha: "none",
		});
	} catch (error) {
		// 画像として読めないデータは InvalidStateError の DOMException になる
		if (!(error instanceof DOMException)) {
			throw error;
		}
		throw new CatalogLoadError(`Failed to decode ${path}.`, { cause: error });
	}

	if (image.width !== MILKY_WAY_TILE_SIZE || image.height !== MILKY_WAY_TILE_SIZE) {
		image.close();
		throw new CatalogLoadError(
			`${path} is ${image.width}x${image.height}, expected ${MILKY_WAY_TILE_SIZE}x${MILKY_WAY_TILE_SIZE}.`,
		);
	}
	return image;
}
