import { afterEach, describe, expect, it, vi } from "vitest";

import { CONSTELLATION_LINE_RECORD_BYTES, STAR_RECORD_BYTES } from "~/domain/catalog-format";

import { CatalogLoadError } from "./fetch-catalog-file";
import { CATALOG, fetchConstellationLineRecords, streamStarRecords } from "./load-catalog";

const STARS_BYTES = CATALOG.starCount * STAR_RECORD_BYTES;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("streamStarRecords", () => {
	it("レコードの途中で切れて届いた塊を、レコード境界にそろえて先頭から順に渡す", async () => {
		const bytes = sequentialBytes(STARS_BYTES);
		stubFetch(new Response(chunkedStream(bytes, [5, 30, 1000, STARS_BYTES])));
		const received: { offset: number; length: number }[] = [];

		await streamStarRecords((records, byteOffset) => {
			expect(records).toEqual(bytes.subarray(byteOffset, byteOffset + records.length));
			received.push({ offset: byteOffset, length: records.length });
		}, new AbortController().signal);

		let expectedOffset = 0;
		for (const { offset, length } of received) {
			expect(offset).toBe(expectedOffset);
			expect(length % STAR_RECORD_BYTES).toBe(0);
			expectedOffset += length;
		}
		expect(expectedOffset).toBe(STARS_BYTES);
	});

	it.each([
		["足りない", STARS_BYTES - STAR_RECORD_BYTES, /has \d+ bytes, expected/u],
		["多すぎる", STARS_BYTES + STAR_RECORD_BYTES, /is larger than/u],
	])(
		"ファイルの大きさが件数と合わない（%s）と CatalogLoadError にする",
		async (_, size, message) => {
			stubFetch(new Response(sequentialBytes(size)));

			const loading = streamStarRecords(() => {}, new AbortController().signal);

			await expect(loading).rejects.toThrow(CatalogLoadError);
			await expect(loading).rejects.toThrow(message);
		},
	);

	it("HTTP エラーは CatalogLoadError にする", async () => {
		stubFetch(new Response(null, { status: 404 }));

		await expect(streamStarRecords(() => {}, new AbortController().signal)).rejects.toThrow(
			"Failed to fetch /stars.bin: HTTP 404.",
		);
	});

	it("通信の失敗は元の例外を cause に持つ CatalogLoadError にする", async () => {
		const networkError = new TypeError("Failed to fetch");
		vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(networkError));

		await expect(streamStarRecords(() => {}, new AbortController().signal)).rejects.toMatchObject({
			name: "CatalogLoadError",
			cause: networkError,
		});
	});

	it("読み込みの途中で通信が切れても CatalogLoadError にする", async () => {
		const networkError = new TypeError("network error");
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(STAR_RECORD_BYTES));
				controller.error(networkError);
			},
		});
		stubFetch(new Response(body));

		await expect(streamStarRecords(() => {}, new AbortController().signal)).rejects.toMatchObject({
			name: "CatalogLoadError",
			cause: networkError,
		});
	});
});

describe("fetchConstellationLineRecords", () => {
	it("件数どおりの大きさのレコードを返す", async () => {
		const bytes = sequentialBytes(CATALOG.constellationLineCount * CONSTELLATION_LINE_RECORD_BYTES);
		stubFetch(new Response(bytes));

		const records = await fetchConstellationLineRecords(new AbortController().signal);

		expect(records).toEqual(bytes);
	});

	it("大きさが件数と合わないと CatalogLoadError にする", async () => {
		stubFetch(new Response(sequentialBytes(CONSTELLATION_LINE_RECORD_BYTES)));

		await expect(fetchConstellationLineRecords(new AbortController().signal)).rejects.toThrow(
			CatalogLoadError,
		);
	});
});

function stubFetch(response: Response): void {
	vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
}

function sequentialBytes(length: number): Uint8Array<ArrayBuffer> {
	return Uint8Array.from({ length }, (_, index) => index % 251);
}

/** sizes の大きさで先頭から順に区切って流す */
function chunkedStream(bytes: Uint8Array, sizes: number[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			let offset = 0;
			for (const size of sizes) {
				if (offset >= bytes.length) {
					break;
				}
				controller.enqueue(bytes.slice(offset, offset + size));
				offset += size;
			}
			controller.close();
		},
	});
}
