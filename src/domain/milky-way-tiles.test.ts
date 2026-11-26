import { describe, expect, it } from "vitest";

import type { CameraState } from "./camera";
import { MAX_FOV, MIN_FOV } from "./camera";
import {
	CUBE_FACE_COUNT,
	MILKY_WAY_MAX_LEVEL,
	milkyWayTileFromIndex,
	milkyWayTileIndex,
} from "./milky-way-format";
import { horizontalToEquatorial, visibleMilkyWayTiles } from "./milky-way-tiles";
import type { Vec3 } from "./vector";
import { computeViewBasis } from "./view";

const LATITUDE_RAD = (35.68 * Math.PI) / 180;
const LOCAL_SIDEREAL_TIME = 1.2;

describe("horizontalToEquatorial", () => {
	it.each<[string, Vec3, { rightAscension: number; declination: number }]>([
		[
			"天頂は赤経が地方恒星時、赤緯が緯度",
			[0, 1, 0],
			{ rightAscension: LOCAL_SIDEREAL_TIME, declination: LATITUDE_RAD },
		],
		[
			"北の地平線は天の北極の下で、赤緯が 90° - 緯度",
			[0, 0, 1],
			{ rightAscension: LOCAL_SIDEREAL_TIME + Math.PI, declination: Math.PI / 2 - LATITUDE_RAD },
		],
		[
			"東の地平線は天の赤道上で、6時間後に南中する",
			[1, 0, 0],
			{ rightAscension: LOCAL_SIDEREAL_TIME + Math.PI / 2, declination: 0 },
		],
	])("%s", (_, horizontal, expected) => {
		const equatorial = horizontalToEquatorial(horizontal, LATITUDE_RAD, LOCAL_SIDEREAL_TIME);

		const expectedDirection = toCartesian(expected.rightAscension, expected.declination);
		for (const [axis, value] of expectedDirection.entries()) {
			expect(equatorial[axis]).toBeCloseTo(value, 10);
		}
	});
});

describe("visibleMilkyWayTiles", () => {
	const LEVEL_ZERO_TILES = Array.from({ length: CUBE_FACE_COUNT }, (_, face) =>
		milkyWayTileIndex({ level: 0, face, x: 0, y: 0 }),
	);

	it("最も粗いレベルの6枚を先頭に置き、その後は粗いレベルから並べる", () => {
		const tiles = visibleTiles({ azimuth: 0, altitude: Math.PI / 4, fov: Math.PI / 2 });

		expect(tiles.slice(0, CUBE_FACE_COUNT).toSorted((a, b) => a - b)).toEqual(LEVEL_ZERO_TILES);
		const levels = tiles.slice(CUBE_FACE_COUNT).map((index) => milkyWayTileFromIndex(index).level);
		expect(levels).toEqual(levels.toSorted((a, b) => a - b));
	});

	it("ズームするほど細かいレベルのタイルを求める", () => {
		const finestLevel = (fov: number): number =>
			Math.max(
				...visibleTiles({ azimuth: 0, altitude: Math.PI / 4, fov }).map(
					(index) => milkyWayTileFromIndex(index).level,
				),
			);

		expect(finestLevel(MIN_FOV)).toBe(MILKY_WAY_MAX_LEVEL);
		expect(finestLevel(MIN_FOV)).toBeGreaterThan(finestLevel(MAX_FOV));
	});

	it("地平線より下だけを見ているときは最も粗いレベルの6枚だけを求める", () => {
		const tiles = visibleTiles({ azimuth: 0, altitude: -Math.PI / 3, fov: MIN_FOV });

		expect(tiles.toSorted((a, b) => a - b)).toEqual(LEVEL_ZERO_TILES);
	});
});

function visibleTiles(camera: CameraState): number[] {
	const widthPx = 1600;
	const heightPx = 1000;
	return visibleMilkyWayTiles({
		view: computeViewBasis(camera, widthPx / heightPx),
		widthPx,
		heightPx,
		latitudeRad: LATITUDE_RAD,
		localSiderealTime: LOCAL_SIDEREAL_TIME,
	});
}

function toCartesian(rightAscension: number, declination: number): Vec3 {
	return [
		Math.cos(declination) * Math.cos(rightAscension),
		Math.cos(declination) * Math.sin(rightAscension),
		Math.sin(declination),
	];
}
