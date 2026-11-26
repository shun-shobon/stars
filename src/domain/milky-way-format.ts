/**
 * 天の川の画像のタイル形式。生成スクリプト、タイルの読み込み、シェーダーはこのファイルの定義に合わせる。
 *
 * 赤道座標の単位球に外接する立方体の6面を、それぞれ4分木でタイルに分ける。
 * レベル L の面は 2^L × 2^L 枚に分かれ、タイルの x は面の u が増える向き、y は面の v が減る向きに数える。
 * タイル画像は周囲 1 画素に隣のタイルの内容を含め、タイルの継ぎ目でも双線形補間が途切れないようにする。
 * 画素値は元画像の線形な放射輝度を sRGB の伝達関数で 8 ビットにしたもの。
 */

export const MILKY_WAY_TILE_SIZE = 256;
export const MILKY_WAY_TILE_BORDER = 1;
export const MILKY_WAY_TILE_CONTENT = MILKY_WAY_TILE_SIZE - MILKY_WAY_TILE_BORDER * 2;

/**
 * 最も細かいレベル。面の幅が 254 × 2^4 = 4064 画素で、1 度あたり面の中心で約 35 画素、辺の近くで約 71 画素になる。
 * 元画像（16k の正距円筒図法で 1 度あたり約 45 画素）と同程度。もう 1 段細かくすると面のほとんどで元画像より細かくなり、
 * 増えた細部の割にタイルの量が 4 倍になる。
 */
export const MILKY_WAY_MAX_LEVEL = 4;

export const CUBE_FACE_COUNT = 6;

export const MILKY_WAY_TILE_COUNT = tileLevelOffset(MILKY_WAY_MAX_LEVEL + 1);

type Axis = readonly [number, number, number];

export type CubeFace = {
	normal: Axis;
	tangentU: Axis;
	tangentV: Axis;
};

/**
 * 赤道座標の直交座標（x は赤経 0h、y は赤経 6h、z は天の北極）での立方体の面。
 * 面上の位置 (u, v) の方向は normal + u * tangentU + v * tangentV で、u と v は辺で ±1 になる。
 */
export const CUBE_FACES: readonly CubeFace[] = [
	{ normal: [1, 0, 0], tangentU: [0, 1, 0], tangentV: [0, 0, 1] },
	{ normal: [-1, 0, 0], tangentU: [0, -1, 0], tangentV: [0, 0, 1] },
	{ normal: [0, 1, 0], tangentU: [-1, 0, 0], tangentV: [0, 0, 1] },
	{ normal: [0, -1, 0], tangentU: [1, 0, 0], tangentV: [0, 0, 1] },
	{ normal: [0, 0, 1], tangentU: [0, 1, 0], tangentV: [-1, 0, 0] },
	{ normal: [0, 0, -1], tangentU: [0, 1, 0], tangentV: [1, 0, 0] },
];

export type MilkyWayTile = {
	level: number;
	face: number;
	x: number;
	y: number;
};

export function cubeFace(face: number): CubeFace {
	const definition = CUBE_FACES[face];
	if (definition == null) {
		throw new RangeError(`Cube face ${face} does not exist.`);
	}
	return definition;
}

/** 全レベルのタイルを1列に並べたときの位置。シェーダーのページテーブルの添字になる */
export function milkyWayTileIndex({ level, face, x, y }: MilkyWayTile): number {
	const tilesPerSide = 2 ** level;
	return tileLevelOffset(level) + face * tilesPerSide * tilesPerSide + y * tilesPerSide + x;
}

export function milkyWayTileFromIndex(index: number): MilkyWayTile {
	if (!Number.isInteger(index) || index < 0 || index >= MILKY_WAY_TILE_COUNT) {
		throw new RangeError(`Milky Way tile index ${index} is out of range.`);
	}

	let level = 0;
	while (index >= tileLevelOffset(level + 1)) {
		level += 1;
	}
	const tilesPerSide = 2 ** level;
	const inLevel = index - tileLevelOffset(level);
	const tilesPerFace = tilesPerSide * tilesPerSide;
	const inFace = inLevel % tilesPerFace;
	return {
		level,
		face: Math.floor(inLevel / tilesPerFace),
		x: inFace % tilesPerSide,
		y: Math.floor(inFace / tilesPerSide),
	};
}

/** 配信するタイル画像の public/ からのパス */
export function milkyWayTilePath({ level, face, x, y }: MilkyWayTile): string {
	return `/milky-way/${level}/${face}/${x}-${y}.webp`;
}

/** レベル level より粗いレベルのタイルの総数 */
export function tileLevelOffset(level: number): number {
	return (CUBE_FACE_COUNT * (4 ** level - 1)) / 3;
}
