const TWO_PI = Math.PI * 2;

/** 方位角の分割数。1テクセルあたり約0.18度 */
export const SKYLINE_TEXTURE_WIDTH = 2048;

type SkylineLayer = {
	/** 建物の並びをレイヤーごとにずらす方位角（ラジアン） */
	azimuthOffset: number;
	heightScale: number;
	/** 建物が建つ確率 */
	density: number;
	widthScale: number;
};

/**
 * 空気遠近法で奥行きを出すための3レイヤー。遠景から前景の順で、composite.wgsl.ts の色の並びと対応する。
 * 遠景は疎で細く高い建物、前景は密で太く低い建物にし、遠景の高層ビルが前景の上にのぞくようにする。
 */
const SKYLINE_LAYERS: readonly SkylineLayer[] = [
	{ azimuthOffset: 0, heightScale: 1, density: 0.25, widthScale: 0.7 },
	{ azimuthOffset: 0.15, heightScale: 0.8, density: 0.35, widthScale: 0.9 },
	{ azimuthOffset: 0.3, heightScale: 0.6, density: 0.45, widthScale: 1.1 },
];

export const SKYLINE_LAYER_COUNT = SKYLINE_LAYERS.length;

const BASE_HEIGHT_DEG = 1;
const HEIGHT_AMPLITUDE_DEG = 5;
/** ビルらしい平らな屋上にするため、高さを1階分の刻みにそろえる */
const FLOOR_HEIGHT_DEG = 0.4;
const BUILDING_WIDTH_MIN_RAD = 0.015;
const BUILDING_WIDTH_MAX_RAD = 0.06;
const BUILDING_SCALE = 80;
/** 1周を埋めるのに十分な建物数 */
const MAX_BUILDINGS = 200;

/**
 * 建物シルエットの高さ（度）を、レイヤーごとに方位角 0〜2π の順で並べて返す。
 * フラグメントシェーダーで毎画素ノイズを計算せずに済むよう、テクスチャに焼き込む値を作る。
 */
export function generateSkylineHeights(): Float32Array {
	const heights = new Float32Array(SKYLINE_TEXTURE_WIDTH * SKYLINE_LAYER_COUNT);

	for (const [layerIndex, layer] of SKYLINE_LAYERS.entries()) {
		for (let texelX = 0; texelX < SKYLINE_TEXTURE_WIDTH; texelX += 1) {
			const azimuth = (texelX / SKYLINE_TEXTURE_WIDTH) * TWO_PI;
			heights[layerIndex * SKYLINE_TEXTURE_WIDTH + texelX] = buildingHeightDeg(azimuth, layer);
		}
	}

	return heights;
}

function buildingHeightDeg(azimuth: number, layer: SkylineLayer): number {
	const buildingIndex = findBuildingIndex(normalizeAngle(azimuth + layer.azimuthOffset), layer);

	// 隣り合う建物が似た密度と高さになるよう、なめらかなノイズで街区のまとまりを作る
	const cluster = valueNoise(buildingIndex * 0.08);
	const existence = hash(buildingIndex * 73.9 + 0.3);
	if (existence > layer.density + cluster * 0.25) {
		return 0;
	}

	const rawHeight = cluster * 0.5 + hash(buildingIndex * 31.7) * 0.5;
	const heightDeg = BASE_HEIGHT_DEG + rawHeight * HEIGHT_AMPLITUDE_DEG;
	const flooredHeightDeg = Math.floor(heightDeg / FLOOR_HEIGHT_DEG) * FLOOR_HEIGHT_DEG;

	return flooredHeightDeg * layer.heightScale;
}

/** 幅の異なる建物を方位角 0 から順に並べ、指定の方位角に建つ建物の番号を返す */
function findBuildingIndex(azimuth: number, layer: SkylineLayer): number {
	const position = azimuth * BUILDING_SCALE;
	let start = 0;

	for (let index = 0; index < MAX_BUILDINGS; index += 1) {
		const width =
			lerp(BUILDING_WIDTH_MIN_RAD, BUILDING_WIDTH_MAX_RAD, hash(index * 17.3 + 0.5)) *
			layer.widthScale *
			BUILDING_SCALE;
		if (start + width > position) {
			return index;
		}
		start += width;
	}

	return MAX_BUILDINGS - 1;
}

/** 0 以上 1 未満の擬似乱数 */
function hash(seed: number): number {
	return fract(Math.sin(seed * 127.1) * 43_758.5453);
}

function valueNoise(x: number): number {
	const cell = Math.floor(x);
	const t = fract(x);
	const smooth = t * t * (3 - 2 * t);
	return lerp(hash(cell), hash(cell + 1), smooth);
}

function normalizeAngle(radians: number): number {
	return ((radians % TWO_PI) + TWO_PI) % TWO_PI;
}

function fract(x: number): number {
	return x - Math.floor(x);
}

function lerp(a: number, b: number, t: number): number {
	return a * (1 - t) + b * t;
}
