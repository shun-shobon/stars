import { fetchMilkyWayTile } from "~/catalog/load-milky-way-tile";
import { milkyWayTileFromIndex } from "~/domain/milky-way-format";
import { visibleMilkyWayTiles } from "~/domain/milky-way-tiles";
import { OBSERVER } from "~/domain/observer";
import type { ViewBasis } from "~/domain/view";
import type { MilkyWayAtlas } from "~/renderer/milky-way-atlas";
import { MILKY_WAY_ATLAS_LAYERS } from "~/renderer/milky-way-atlas";

/** 同時に取りに行くタイルの数。HTTP/2 では1本の接続に多重化されるので、この程度は並べても詰まらない */
const MAX_CONCURRENT_REQUESTS = 8;

/**
 * 要るタイルを調べ直す間隔。大きな画面では1回に数ミリ秒かかるので毎フレームは調べない。
 * 視点の動きに対してこの程度遅れても、届くまでは粗いタイルで描くので欠けは見えない。
 */
const UPDATE_INTERVAL_MS = 200;

type MilkyWayFrame = {
	view: ViewBasis;
	widthPx: number;
	heightPx: number;
	localSiderealTime: number;
};

export type MilkyWayTileStream = {
	/** 描画のたびに呼ぶ。画面に要るタイルを調べ、まだ届いていないものを優先度の高い順に取りに行く */
	update: (frame: MilkyWayFrame, timestampMs: number) => void;
};

type StartMilkyWayTileStreamOptions = {
	atlas: Pick<MilkyWayAtlas, "has" | "markUsed" | "upload">;
	/** 中断すると、取得中のタイルを置かずに捨て、それ以降は取りに行かない */
	signal: AbortSignal;
	onError: (error: unknown) => void;
};

export function startMilkyWayTileStream({
	atlas,
	signal,
	onError,
}: StartMilkyWayTileStreamOptions): MilkyWayTileStream {
	const inFlight = new Set<number>();
	let wanted: number[] = [];
	let wantedSet = new Set<number>();
	let lastUpdateMs = Number.NEGATIVE_INFINITY;

	const receive = (tileIndex: number, image: ImageBitmap): void => {
		try {
			// 取りに行った後に視点が動いて要らなくなったタイルは、今の画面に要るタイルを追い出さないよう置かない
			if (!signal.aborted && wantedSet.has(tileIndex)) {
				atlas.upload(tileIndex, image);
			}
		} finally {
			image.close();
		}
	};

	const requestNext = (): void => {
		for (const tileIndex of wanted) {
			if (signal.aborted || inFlight.size >= MAX_CONCURRENT_REQUESTS) {
				return;
			}
			if (atlas.has(tileIndex) || inFlight.has(tileIndex)) {
				continue;
			}

			inFlight.add(tileIndex);
			fetchMilkyWayTile(milkyWayTileFromIndex(tileIndex), signal)
				.then((image) => {
					receive(tileIndex, image);
					inFlight.delete(tileIndex);
					requestNext();
				})
				.catch((error: unknown) => {
					// 中断した結果の失敗は、利用者に見せるものではない
					if (signal.aborted) {
						return;
					}
					onError(error);
				});
		}
	};

	return {
		update: (frame, timestampMs) => {
			if (timestampMs - lastUpdateMs < UPDATE_INTERVAL_MS) {
				return;
			}
			lastUpdateMs = timestampMs;

			// 置ききれない分まで取りに行くと、届いたタイルどうしで追い出し合う
			wanted = visibleMilkyWayTiles({ ...frame, latitudeRad: OBSERVER.latitudeRad }).slice(
				0,
				MILKY_WAY_ATLAS_LAYERS,
			);
			wantedSet = new Set(wanted);
			atlas.markUsed(wanted);
			requestNext();
		},
	};
}
