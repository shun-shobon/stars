import type { MilkyWayTile } from "./milky-way-format";
import {
	CUBE_FACE_COUNT,
	cubeFace,
	MILKY_WAY_MAX_LEVEL,
	MILKY_WAY_TILE_CONTENT,
	milkyWayTileIndex,
} from "./milky-way-format";
import type { Vec3 } from "./vector";
import { dot } from "./vector";
import type { ViewBasis } from "./view";
import { screenToDirection } from "./view";

/**
 * 画面の 1 画素に対しタイルの 1 画素がどれだけ細かくなるまでレベルを上げるかの差し引き。
 * 0.5 だと、混ぜ合わせる2つのレベルのうち細かい方が 1 画素あたり約 0.7〜1.4 テクセルになる。
 * 天の川はなだらかなので、これより細かくしても見た目は変わらずタイルの数だけが増える。
 */
export const MILKY_WAY_LOD_BIAS = 0.5;

/** 地平線から少し下まで描く。背景のシェーダーが天の川を消し始める高度と合わせる */
const MIN_VISIBLE_ALTITUDE_RAD = (-5 * Math.PI) / 180;

/**
 * 画面上でタイルを探す間隔。タイルは画面上で最も小さくても約 127 画素あるので、
 * その半分の間隔で調べれば見落とさない。
 */
const SCREEN_SAMPLE_STEP_PX = 64;

type FaceCoordinates = {
	face: number;
	/** 面上の位置。面の中心が 0 で、辺が ±1 */
	u: number;
	v: number;
};

/** 方向が通る立方体の面。成分の絶対値が最も大きい軸の面になる */
function cubeFaceOf(direction: Vec3): number {
	const x = Math.abs(direction[0]);
	const y = Math.abs(direction[1]);
	const z = Math.abs(direction[2]);
	if (x >= y && x >= z) {
		return direction[0] >= 0 ? 0 : 1;
	}
	if (y >= z) {
		return direction[1] >= 0 ? 2 : 3;
	}
	return direction[2] >= 0 ? 4 : 5;
}

/** 方向を面の平面に投影した位置。面の外の方向では ±1 を超える */
function projectOntoFace(direction: Vec3, face: number): FaceCoordinates {
	const { normal, tangentU, tangentV } = cubeFace(face);
	const depth = dot(direction, normal);
	return { face, u: dot(direction, tangentU) / depth, v: dot(direction, tangentV) / depth };
}

/**
 * 地平座標の方向を赤道座標の方向に変える。地平座標は東 +X、天頂 +Y、北 +Z。
 * shared.wgsl.ts の horizontalToEquatorial と同じ計算。
 */
export function horizontalToEquatorial(
	direction: Vec3,
	latitudeRad: number,
	localSiderealTime: number,
): Vec3 {
	const [east, zenith, north] = direction;
	const sinLatitude = Math.sin(latitudeRad);
	const cosLatitude = Math.cos(latitudeRad);

	// 天の北極、子午線上の天の赤道、西の地平線の3方向の成分。時角で表すと cosδcosH、cosδsinH、sinδ
	const towardMeridian = cosLatitude * zenith - sinLatitude * north;
	const towardWest = -east;
	const towardPole = cosLatitude * north + sinLatitude * zenith;

	// 赤経 = 地方恒星時 - 時角
	const cosLst = Math.cos(localSiderealTime);
	const sinLst = Math.sin(localSiderealTime);
	return [
		cosLst * towardMeridian + sinLst * towardWest,
		sinLst * towardMeridian - cosLst * towardWest,
		towardPole,
	];
}

/**
 * 画面の 1 画素あたりの面上の移動量から、描くレベルを小数で求める。shared.wgsl.ts の milkyWayLod と同じ計算。
 */
function milkyWayLod(faceUnitsPerPixel: number): number {
	const lod = Math.log2(2 / (MILKY_WAY_TILE_CONTENT * faceUnitsPerPixel)) - MILKY_WAY_LOD_BIAS;
	return Math.min(Math.max(lod, 0), MILKY_WAY_MAX_LEVEL);
}

function tileAt({ face, u, v }: FaceCoordinates, level: number): MilkyWayTile {
	const tilesPerSide = 2 ** level;
	const toTile = (position: number): number =>
		Math.min(Math.floor(position * tilesPerSide), tilesPerSide - 1);
	return { level, face, x: toTile((u + 1) / 2), y: toTile((1 - v) / 2) };
}

type VisibleTilesOptions = {
	view: ViewBasis;
	widthPx: number;
	heightPx: number;
	latitudeRad: number;
	localSiderealTime: number;
};

/**
 * 画面を描くのに要るタイルを、先に読むべき順に返す。
 * 最も粗いレベルの6枚は、細かいタイルが届くまでの代わりになるので常に先頭に置く。
 * 続けて粗いレベルから、同じレベルでは画面の中心に近い順に並べる。
 */
export function visibleMilkyWayTiles({
	view,
	widthPx,
	heightPx,
	latitudeRad,
	localSiderealTime,
}: VisibleTilesOptions): number[] {
	const priorities = new Map<number, number>();
	const request = (tile: MilkyWayTile, distanceFromCenter: number): void => {
		const index = milkyWayTileIndex(tile);
		const priority = tile.level * 2 + distanceFromCenter;
		priorities.set(index, Math.min(priorities.get(index) ?? priority, priority));
	};

	const directionAt = (xPx: number, yPx: number): Vec3 =>
		horizontalToEquatorial(
			screenToDirection(view, { x: xPx / widthPx, y: yPx / heightPx }),
			latitudeRad,
			localSiderealTime,
		);

	for (const yPx of samplePositions(heightPx)) {
		for (const xPx of samplePositions(widthPx)) {
			const horizontal = screenToDirection(view, { x: xPx / widthPx, y: yPx / heightPx });
			if (Math.asin(horizontal[1]) < MIN_VISIBLE_ALTITUDE_RAD) {
				continue;
			}

			const direction = horizontalToEquatorial(horizontal, latitudeRad, localSiderealTime);
			const position = projectOntoFace(direction, cubeFaceOf(direction));
			const right = projectOntoFace(directionAt(xPx + 1, yPx), position.face);
			const below = projectOntoFace(directionAt(xPx, yPx + 1), position.face);
			const faceUnitsPerPixel = Math.max(
				Math.hypot(right.u - position.u, right.v - position.v),
				Math.hypot(below.u - position.u, below.v - position.v),
			);

			// シェーダーは小数のレベルの前後2つを混ぜる
			const lod = milkyWayLod(faceUnitsPerPixel);
			const coarser = Math.floor(lod);
			const finer = Math.min(coarser + 1, MILKY_WAY_MAX_LEVEL);
			const distanceFromCenter = Math.hypot(xPx / widthPx - 0.5, yPx / heightPx - 0.5);
			request(tileAt(position, coarser), distanceFromCenter);
			request(tileAt(position, finer), distanceFromCenter);
		}
	}

	for (let face = 0; face < CUBE_FACE_COUNT; face += 1) {
		priorities.set(milkyWayTileIndex({ level: 0, face, x: 0, y: 0 }), -1);
	}

	return [...priorities.entries()].toSorted((a, b) => a[1] - b[1]).map(([index]) => index);
}

/** 0 から size まで、端も含めて間隔ごとに並べる */
function samplePositions(size: number): number[] {
	const positions: number[] = [];
	for (let position = 0; position < size; position += SCREEN_SAMPLE_STEP_PX) {
		positions.push(position);
	}
	positions.push(size);
	return positions;
}
