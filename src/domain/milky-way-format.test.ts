import { describe, expect, it } from "vitest";

import {
	CUBE_FACE_COUNT,
	MILKY_WAY_MAX_LEVEL,
	milkyWayTileFromIndex,
	milkyWayTileIndex,
} from "./milky-way-format";

describe("milkyWayTileIndex", () => {
	it("全レベルのタイルに 0 から重ならない通し番号を振り、通し番号からタイルに戻せる", () => {
		let expectedIndex = 0;

		for (let level = 0; level <= MILKY_WAY_MAX_LEVEL; level += 1) {
			for (let face = 0; face < CUBE_FACE_COUNT; face += 1) {
				for (let y = 0; y < 2 ** level; y += 1) {
					for (let x = 0; x < 2 ** level; x += 1) {
						const tile = { level, face, x, y };
						const index = milkyWayTileIndex(tile);

						expect(index).toBe(expectedIndex);
						expect(milkyWayTileFromIndex(index)).toEqual(tile);
						expectedIndex += 1;
					}
				}
			}
		}
	});

	it("範囲外の通し番号はタイルに戻さない", () => {
		const lastIndex = milkyWayTileIndex({
			level: MILKY_WAY_MAX_LEVEL,
			face: CUBE_FACE_COUNT - 1,
			x: 2 ** MILKY_WAY_MAX_LEVEL - 1,
			y: 2 ** MILKY_WAY_MAX_LEVEL - 1,
		});

		expect(() => milkyWayTileFromIndex(lastIndex + 1)).toThrow(RangeError);
	});
});
