import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMilkyWayTile } from "~/catalog/load-milky-way-tile";
import { INITIAL_CAMERA } from "~/domain/camera";
import { milkyWayTileIndex } from "~/domain/milky-way-format";
import { visibleMilkyWayTiles } from "~/domain/milky-way-tiles";
import { computeViewBasis } from "~/domain/view";

import { startMilkyWayTileStream } from "./milky-way-tile-stream";

vi.mock("~/catalog/load-milky-way-tile", () => ({ fetchMilkyWayTile: vi.fn() }));
vi.mock("~/domain/milky-way-tiles", () => ({ visibleMilkyWayTiles: vi.fn() }));

const FRAME = {
	view: computeViewBasis(INITIAL_CAMERA, 1),
	widthPx: 100,
	heightPx: 100,
	localSiderealTime: 0,
};

const pending = new Map<number, Deferred<ImageBitmap>>();

beforeEach(() => {
	pending.clear();
	vi.mocked(fetchMilkyWayTile).mockReset();
	vi.mocked(fetchMilkyWayTile).mockImplementation((tile) => {
		const deferred = createDeferred<ImageBitmap>();
		pending.set(milkyWayTileIndex(tile), deferred);
		return deferred.promise;
	});
});

describe("startMilkyWayTileStream", () => {
	it("同時に取りに行くのは8枚までで、届くたびに次を取りに行く", async () => {
		const atlas = fakeAtlas();
		const stream = startStream(atlas);
		wantTiles(range(0, 12));

		stream.update(FRAME, 0);

		expect([...pending.keys()]).toEqual(range(0, 8));
		pending.get(0)?.resolve(fakeImage());
		await vi.waitFor(() => {
			expect(pending.has(8)).toBe(true);
		});
		expect(atlas.uploaded).toEqual([0]);
	});

	it("取りに行った後に要らなくなったタイルは、置かずに解放する", async () => {
		const atlas = fakeAtlas();
		const stream = startStream(atlas);
		wantTiles([0, 7]);
		stream.update(FRAME, 0);
		wantTiles([0]);
		stream.update(FRAME, 1000);

		const close = vi.fn();
		pending.get(7)?.resolve(fakeImage(close));

		await vi.waitFor(() => {
			expect(close).toHaveBeenCalled();
		});
		expect(atlas.uploaded).toEqual([]);
	});

	it("中断した後に届いたタイルは置かずに解放し、それ以降は取りに行かない", async () => {
		const atlas = fakeAtlas();
		const abortController = new AbortController();
		const stream = startStream(atlas, abortController.signal);
		wantTiles(range(0, 12));
		stream.update(FRAME, 0);

		abortController.abort();
		const close = vi.fn();
		pending.get(0)?.resolve(fakeImage(close));

		await vi.waitFor(() => {
			expect(close).toHaveBeenCalled();
		});
		expect(atlas.uploaded).toEqual([]);
		expect(pending.has(8)).toBe(false);
	});

	it("取得の失敗を onError に渡す", async () => {
		const onError = vi.fn();
		const stream = startStream(fakeAtlas(), new AbortController().signal, onError);
		wantTiles([0]);
		stream.update(FRAME, 0);

		const error = new Error("network error");
		pending.get(0)?.reject(error);

		await vi.waitFor(() => {
			expect(onError).toHaveBeenCalledWith(error);
		});
	});
});

type FakeAtlas = {
	uploaded: number[];
	has: (tileIndex: number) => boolean;
	markUsed: (tileIndices: Iterable<number>) => void;
	upload: (tileIndex: number, image: ImageBitmap) => void;
};

function fakeAtlas(): FakeAtlas {
	const uploaded: number[] = [];
	return {
		uploaded,
		has: (tileIndex) => uploaded.includes(tileIndex),
		markUsed: () => {},
		upload: (tileIndex) => {
			uploaded.push(tileIndex);
		},
	};
}

function startStream(
	atlas: FakeAtlas,
	signal = new AbortController().signal,
	onError: (error: unknown) => void = () => {},
): ReturnType<typeof startMilkyWayTileStream> {
	return startMilkyWayTileStream({ atlas, signal, onError });
}

function wantTiles(tileIndices: number[]): void {
	vi.mocked(visibleMilkyWayTiles).mockReturnValue(tileIndices);
}

function fakeImage(close = vi.fn()): ImageBitmap {
	return { width: 256, height: 256, close };
}

function range(start: number, end: number): number[] {
	return Array.from({ length: end - start }, (_, index) => start + index);
}

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}
