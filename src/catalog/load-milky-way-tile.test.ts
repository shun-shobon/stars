import { afterEach, describe, expect, it, vi } from "vitest";

import { MILKY_WAY_TILE_SIZE } from "~/domain/milky-way-format";

import { CatalogLoadError } from "./fetch-catalog-file";
import { fetchMilkyWayTile } from "./load-milky-way-tile";

const TILE = { level: 2, face: 3, x: 1, y: 0 };

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchMilkyWayTile", () => {
	it("タイルのパスから取得し、色空間を変換せずに画像にする", async () => {
		const fetchMock = stubFetch(new Response(new Uint8Array([1, 2, 3])));
		const image = fakeImage(MILKY_WAY_TILE_SIZE, MILKY_WAY_TILE_SIZE);
		const createImageBitmapMock = vi.fn<typeof createImageBitmap>().mockResolvedValue(image);
		vi.stubGlobal("createImageBitmap", createImageBitmapMock);

		const result = await fetchMilkyWayTile(TILE, new AbortController().signal);

		expect(result).toBe(image);
		expect(fetchMock).toHaveBeenCalledWith("/milky-way/2/3/1-0.webp", expect.anything());
		expect(createImageBitmapMock).toHaveBeenCalledWith(expect.any(Blob), {
			colorSpaceConversion: "none",
			premultiplyAlpha: "none",
		});
	});

	it("HTTP エラーは CatalogLoadError にする", async () => {
		stubFetch(new Response(null, { status: 404 }));

		await expect(fetchMilkyWayTile(TILE, new AbortController().signal)).rejects.toThrow(
			"Failed to fetch /milky-way/2/3/1-0.webp: HTTP 404.",
		);
	});

	it("画像として読めないデータは CatalogLoadError にする", async () => {
		stubFetch(new Response(new Uint8Array([1, 2, 3])));
		const decodeError = new DOMException(
			"The source image cannot be decoded.",
			"InvalidStateError",
		);
		vi.stubGlobal(
			"createImageBitmap",
			vi.fn<typeof createImageBitmap>().mockRejectedValue(decodeError),
		);

		await expect(fetchMilkyWayTile(TILE, new AbortController().signal)).rejects.toMatchObject({
			name: "CatalogLoadError",
			cause: decodeError,
		});
	});

	it("大きさがタイルと合わない画像は解放して CatalogLoadError にする", async () => {
		stubFetch(new Response(new Uint8Array([1, 2, 3])));
		const close = vi.fn();
		const image = fakeImage(MILKY_WAY_TILE_SIZE, MILKY_WAY_TILE_SIZE / 2, close);
		vi.stubGlobal("createImageBitmap", vi.fn<typeof createImageBitmap>().mockResolvedValue(image));

		await expect(fetchMilkyWayTile(TILE, new AbortController().signal)).rejects.toThrow(
			CatalogLoadError,
		);
		expect(close).toHaveBeenCalled();
	});
});

function stubFetch(response: Response): ReturnType<typeof vi.fn<typeof fetch>> {
	const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function fakeImage(width: number, height: number, close = vi.fn()): ImageBitmap {
	return { width, height, close };
}
