/**
 * NASA SVS の Deep Star Maps 2020 から、明るい星を除いた天の川の画像を取り、描画用のタイルに分ける。
 *
 * - 入力: 赤道座標の正距円筒図法の EXR（赤経 0h が中央で、赤経は左へ増える）。初回に .cache/ へダウンロードする
 * - 出力: public/milky-way/ 以下のタイル画像。形式は src/domain/milky-way-format.ts に従う
 */

import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import sharp from "sharp";

import {
	CUBE_FACE_COUNT,
	cubeFace,
	MILKY_WAY_MAX_LEVEL,
	MILKY_WAY_TILE_BORDER,
	MILKY_WAY_TILE_CONTENT,
	MILKY_WAY_TILE_SIZE,
	milkyWayTilePath,
} from "../src/domain/milky-way-format.ts";
import type { ExrImage } from "./read-exr.ts";
import { decodeExr, HALF_TO_FLOAT } from "./read-exr.ts";

const SOURCE_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_16k.exr";

const ROOT_DIR = join(import.meta.dirname, "..");
const SOURCE_PATH = join(ROOT_DIR, ".cache/milkyway_2020_16k.exr");
const OUTPUT_DIR = join(ROOT_DIR, "public/milky-way");

/**
 * 最も細かいレベルの面の画像の外周に足す余白。粗いレベルに縮めても、どのレベルでもタイルの縁の 1 画素分が残る。
 */
const FACE_MARGIN = MILKY_WAY_TILE_BORDER * 2 ** MILKY_WAY_MAX_LEVEL;
const FACE_CONTENT = MILKY_WAY_TILE_CONTENT * 2 ** MILKY_WAY_MAX_LEVEL;
const FACE_SIZE = FACE_CONTENT + FACE_MARGIN * 2;

/** 1 テクセルを 2×2 点の平均にし、元画像の画素がタイルの画素より細かい極付近でのちらつきを抑える */
const SUPERSAMPLE_OFFSETS = [-0.25, 0.25];

/**
 * タイルの画素値 1 に当てる元画像の値。元画像の値は画素内の星の明るさの合計で、16k では99.99%の画素がこれより暗い。
 * これより明るい画素は最も細かいレベルの一部の星だけで、飽和させても見た目は変わらない。
 * 暗い側は sRGB の伝達関数で階調を残す。
 */
const WHITE_LEVEL = 0.05;

/**
 * 暗い星の粒が細かく散らばった画像なので、品質を上げるほどファイルが膨らむ（90 では全タイルで約 53MiB、70 で約 30MiB）。
 * 70 でも粒がわずかにならされるだけで、天の川の濃淡は変わらない。
 */
const WEBP_QUALITY = 70;

type FaceImage = {
	size: number;
	/** 線形の RGB。画素ごとに3つ並べ、上の行から並ぶ */
	rgb: Float32Array;
};

await downloadSource();
console.log(`Decoding ${SOURCE_PATH}`);
const source = decodeExr(await readFile(SOURCE_PATH));
console.log(`Source: ${source.width}x${source.height}`);

await rm(OUTPUT_DIR, { recursive: true, force: true });
let tileCount = 0;
let totalBytes = 0;

for (let face = 0; face < CUBE_FACE_COUNT; face += 1) {
	const levels = buildPyramid(renderFace(source, face));
	for (const [level, image] of levels.entries()) {
		const tilesPerSide = 2 ** level;
		for (let y = 0; y < tilesPerSide; y += 1) {
			for (let x = 0; x < tilesPerSide; x += 1) {
				const path = join(ROOT_DIR, "public", milkyWayTilePath({ level, face, x, y }));
				const webp = await encodeTile(image, level, x, y);
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, webp);
				tileCount += 1;
				totalBytes += webp.length;
			}
		}
	}
	console.log(`Face ${face}: done`);
}

console.log(`Tiles: ${tileCount}, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB`);

async function downloadSource(): Promise<void> {
	const exists = await stat(SOURCE_PATH).then(
		() => true,
		(error: unknown) => {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return false;
			}
			throw error;
		},
	);
	if (exists) {
		return;
	}

	console.log(`Downloading ${SOURCE_URL}`);
	const response = await fetch(SOURCE_URL);
	if (!response.ok || response.body == null) {
		throw new Error(`Failed to download ${SOURCE_URL}: HTTP ${response.status}.`);
	}
	await mkdir(dirname(SOURCE_PATH), { recursive: true });
	const partialPath = `${SOURCE_PATH}.partial`;
	await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath));
	// 途中で止まったダウンロードを、次の実行で完成品と取り違えないようにする
	await rename(partialPath, SOURCE_PATH);
}

/**
 * 最も細かいレベルの面を、余白も含めて元画像から描く。余白の画素は隣の面の方向を指すので、面の継ぎ目もつながる。
 */
function renderFace(image: ExrImage, face: number): FaceImage {
	const { normal, tangentU, tangentV } = cubeFace(face);
	const rgb = new Float32Array(FACE_SIZE * FACE_SIZE * 3);
	const sample = new Float32Array(3);

	for (let row = 0; row < FACE_SIZE; row += 1) {
		for (let column = 0; column < FACE_SIZE; column += 1) {
			let red = 0;
			let green = 0;
			let blue = 0;

			for (const offsetY of SUPERSAMPLE_OFFSETS) {
				for (const offsetX of SUPERSAMPLE_OFFSETS) {
					const u = ((column - FACE_MARGIN + 0.5 + offsetX) / FACE_CONTENT) * 2 - 1;
					const v = 1 - ((row - FACE_MARGIN + 0.5 + offsetY) / FACE_CONTENT) * 2;
					const dx = normal[0] + tangentU[0] * u + tangentV[0] * v;
					const dy = normal[1] + tangentU[1] * u + tangentV[1] * v;
					const dz = normal[2] + tangentU[2] * u + tangentV[2] * v;
					const rightAscension = Math.atan2(dy, dx);
					const declination = Math.atan2(dz, Math.hypot(dx, dy));
					sampleEquirectangular(image, rightAscension, declination, sample);
					red += sample[0]!;
					green += sample[1]!;
					blue += sample[2]!;
				}
			}

			const sampleCount = SUPERSAMPLE_OFFSETS.length ** 2;
			const index = (row * FACE_SIZE + column) * 3;
			rgb[index] = red / sampleCount;
			rgb[index + 1] = green / sampleCount;
			rgb[index + 2] = blue / sampleCount;
		}
	}

	return { size: FACE_SIZE, rgb };
}

function sampleEquirectangular(
	image: ExrImage,
	rightAscension: number,
	declination: number,
	out: Float32Array,
): void {
	const { width, height, rgb } = image;
	const u = 0.5 - rightAscension / (2 * Math.PI);
	const x = (u - Math.floor(u)) * width - 0.5;
	const y = (0.5 - declination / Math.PI) * height - 0.5;

	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const tx = x - x0;
	const ty = y - y0;
	const left = (x0 + width) % width;
	const right = (x0 + 1) % width;
	const top = Math.min(Math.max(y0, 0), height - 1);
	const bottom = Math.min(Math.max(y0 + 1, 0), height - 1);

	for (let channel = 0; channel < 3; channel += 1) {
		const at = (column: number, row: number): number =>
			HALF_TO_FLOAT[rgb[(row * width + column) * 3 + channel]!]!;
		const upper = at(left, top) * (1 - tx) + at(right, top) * tx;
		const lower = at(left, bottom) * (1 - tx) + at(right, bottom) * tx;
		out[channel] = upper * (1 - ty) + lower * ty;
	}
}

/** 最も細かいレベルから 2×2 画素の平均で縮め、粗いレベルの面を作る。添字がレベルになる */
function buildPyramid(finest: FaceImage): FaceImage[] {
	const levels = [finest];
	for (let level = MILKY_WAY_MAX_LEVEL; level > 0; level -= 1) {
		levels.unshift(downsample(levels[0]!));
	}
	return levels;
}

function downsample({ size, rgb }: FaceImage): FaceImage {
	const half = size / 2;
	const result = new Float32Array(half * half * 3);

	for (let row = 0; row < half; row += 1) {
		for (let column = 0; column < half; column += 1) {
			for (let channel = 0; channel < 3; channel += 1) {
				const at = (r: number, c: number): number => rgb[(r * size + c) * 3 + channel]!;
				const sum =
					at(row * 2, column * 2) +
					at(row * 2, column * 2 + 1) +
					at(row * 2 + 1, column * 2) +
					at(row * 2 + 1, column * 2 + 1);
				result[(row * half + column) * 3 + channel] = sum / 4;
			}
		}
	}

	return { size: half, rgb: result };
}

async function encodeTile(image: FaceImage, level: number, x: number, y: number): Promise<Buffer> {
	const margin = MILKY_WAY_TILE_BORDER * 2 ** level;
	const left = margin + x * MILKY_WAY_TILE_CONTENT - MILKY_WAY_TILE_BORDER;
	const top = margin + y * MILKY_WAY_TILE_CONTENT - MILKY_WAY_TILE_BORDER;
	const pixels = Buffer.alloc(MILKY_WAY_TILE_SIZE * MILKY_WAY_TILE_SIZE * 3);

	for (let row = 0; row < MILKY_WAY_TILE_SIZE; row += 1) {
		for (let column = 0; column < MILKY_WAY_TILE_SIZE; column += 1) {
			const sourceIndex = ((top + row) * image.size + left + column) * 3;
			const targetIndex = (row * MILKY_WAY_TILE_SIZE + column) * 3;
			for (let channel = 0; channel < 3; channel += 1) {
				pixels[targetIndex + channel] = encodeSrgb(image.rgb[sourceIndex + channel]!);
			}
		}
	}

	return await sharp(pixels, {
		raw: { width: MILKY_WAY_TILE_SIZE, height: MILKY_WAY_TILE_SIZE, channels: 3 },
	})
		.webp({ quality: WEBP_QUALITY })
		.toBuffer();
}

function encodeSrgb(value: number): number {
	const clamped = Math.min(Math.max(value / WHITE_LEVEL, 0), 1);
	const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
	return Math.round(encoded * 255);
}
