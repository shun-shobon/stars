/**
 * Hipparcos 星表と星座線の CSV から、描画用の星カタログを生成する。
 *
 * - public/stars.bin: 明るい順に並べた星のレコード
 * - public/constellations.bin: 星座線のレコード
 * - src/catalog/catalog-meta.json: レコード数と最も暗い星の等級
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	CONSTELLATION_LINE_RECORD_BYTES,
	STAR_RECORD_BYTES,
} from "../src/domain/catalog-format.ts";

type Star = {
	hip: number;
	raRad: number;
	decRad: number;
	magnitude: number;
	bv: number;
};

type ConstellationLine = {
	from: Star;
	to: Star;
};

const ROOT_DIR = join(import.meta.dirname, "..");
const STARS_CSV_PATH = join(ROOT_DIR, "data/hipparcos-voidmain.csv");
const CONSTELLATION_LINES_CSV_PATH = join(ROOT_DIR, "data/hip_constellation_line.csv");
const STARS_BIN_PATH = join(ROOT_DIR, "public/stars.bin");
const CONSTELLATIONS_BIN_PATH = join(ROOT_DIR, "public/constellations.bin");
const META_PATH = join(ROOT_DIR, "src/catalog/catalog-meta.json");

/** B-V の欠けた星は、色を決めるために太陽と同じ G 型の値とみなす */
const DEFAULT_BV = 0.65;

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/u;

const starsCsv = await readFile(STARS_CSV_PATH, "utf8");
const { stars, skippedCount } = parseStars(starsCsv);
stars.sort((a, b) => a.magnitude - b.magnitude);
console.log(`Stars: ${stars.length} (skipped ${skippedCount} without position or magnitude)`);

const constellationLinesCsv = await readFile(CONSTELLATION_LINES_CSV_PATH, "utf8");
const lines = parseConstellationLines(
	constellationLinesCsv,
	new Map(stars.map((star) => [star.hip, star])),
);
console.log(`Constellation lines: ${lines.length}`);

await writeFile(
	STARS_BIN_PATH,
	encodeRecords(stars, STAR_RECORD_BYTES, (star) => [
		star.raRad,
		star.decRad,
		star.magnitude,
		star.bv,
	]),
);
await writeFile(
	CONSTELLATIONS_BIN_PATH,
	encodeRecords(lines, CONSTELLATION_LINE_RECORD_BYTES, ({ from, to }) => [
		from.raRad,
		from.decRad,
		to.raRad,
		to.decRad,
	]),
);
await writeFile(
	META_PATH,
	`${JSON.stringify({
		starCount: stars.length,
		faintestMagnitude: stars.at(-1)?.magnitude,
		constellationLineCount: lines.length,
	})}\n`,
);

function parseStars(csv: string): { stars: Star[]; skippedCount: number } {
	const [header = "", ...rows] = csv.trimEnd().split(/\r?\n/u);
	const columns = header.split(",");
	const columnIndex = (name: string): number => {
		const index = columns.indexOf(name);
		if (index === -1) {
			throw new Error(`Missing column "${name}" in ${STARS_CSV_PATH}.`);
		}
		return index;
	};
	const hipIndex = columnIndex("HIP");
	const raIndex = columnIndex("RAdeg");
	const decIndex = columnIndex("DEdeg");
	const magnitudeIndex = columnIndex("Vmag");
	const bvIndex = columnIndex("B-V");

	const parsedStars: Star[] = [];
	let skipped = 0;

	for (const [rowIndex, row] of rows.entries()) {
		const cells = row.split(",");
		const field = (index: number): number | null => parseOptionalNumber(cells[index], rowIndex + 2);

		const hip = field(hipIndex);
		const raDeg = field(raIndex);
		const decDeg = field(decIndex);
		const magnitude = field(magnitudeIndex);

		// Hipparcos には位置解や等級が得られなかった星が含まれ、描画できないので除く
		if (hip == null || raDeg == null || decDeg == null || magnitude == null) {
			skipped += 1;
			continue;
		}

		parsedStars.push({
			hip,
			raRad: degreesToRadians(raDeg),
			decRad: degreesToRadians(decDeg),
			magnitude,
			bv: field(bvIndex) ?? DEFAULT_BV,
		});
	}

	return { stars: parsedStars, skippedCount: skipped };
}

function parseConstellationLines(csv: string, starsByHip: Map<number, Star>): ConstellationLine[] {
	return csv
		.trimEnd()
		.split(/\r?\n/u)
		.map((row, rowIndex) => {
			const [, fromHip, toHip] = row.split(",");
			return {
				from: findStar(starsByHip, fromHip, rowIndex + 1),
				to: findStar(starsByHip, toHip, rowIndex + 1),
			};
		});
}

function findStar(
	starsByHip: Map<number, Star>,
	hip: string | undefined,
	lineNumber: number,
): Star {
	const star = starsByHip.get(Number(hip));
	if (star == null) {
		throw new Error(`Unknown HIP "${hip}" at ${CONSTELLATION_LINES_CSV_PATH}:${lineNumber}.`);
	}
	return star;
}

function parseOptionalNumber(cell: string | undefined, lineNumber: number): number | null {
	const trimmed = cell?.trim() ?? "";
	if (trimmed === "") {
		return null;
	}

	if (!DECIMAL_PATTERN.test(trimmed)) {
		throw new Error(`Non-numeric value "${trimmed}" at ${STARS_CSV_PATH}:${lineNumber}.`);
	}
	return Number(trimmed);
}

function encodeRecords<T>(
	items: T[],
	recordBytes: number,
	toFloats: (item: T) => number[],
): Uint8Array {
	const buffer = new ArrayBuffer(items.length * recordBytes);
	const view = new DataView(buffer);

	for (const [itemIndex, item] of items.entries()) {
		for (const [floatIndex, value] of toFloats(item).entries()) {
			view.setFloat32(itemIndex * recordBytes + floatIndex * 4, value, true);
		}
	}

	return new Uint8Array(buffer);
}

function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}
