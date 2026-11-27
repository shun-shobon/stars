import { describe, expect, it } from "vitest";

import type { CameraState } from "./camera";
import { MAX_FOV, MIN_FOV } from "./camera";
import { computeViewBasis, projectToScreen, screenToDirection } from "./view";

const NORTH_HORIZON: CameraState = { azimuth: 0, altitude: 0, fov: Math.PI / 2 };

describe("computeViewBasis", () => {
	it("最小視野角ではカメラが天球の中心にあり、最大視野角では視線の逆へ 0.5 下がる", () => {
		const narrow = computeViewBasis({ ...NORTH_HORIZON, fov: MIN_FOV }, 1);
		const wide = computeViewBasis({ ...NORTH_HORIZON, fov: MAX_FOV }, 1);

		expect(narrow.position.map(Math.abs)).toEqual([0, 0, 0]);
		expect(wide.position[2]).toBeCloseTo(-0.5, 10);
	});

	it("天頂を向いても右方向ベクトルが定まる", () => {
		const basis = computeViewBasis({ azimuth: 0, altitude: Math.PI / 2, fov: Math.PI / 2 }, 1);

		expect(basis.right).toEqual([1, 0, 0]);
	});
});

describe("projectToScreen", () => {
	it("視線の先の点は画面中央に来る", () => {
		const basis = computeViewBasis(NORTH_HORIZON, 16 / 9);

		const point = projectToScreen(basis, NORTH_HORIZON.azimuth, NORTH_HORIZON.altitude);

		expect(point?.x).toBeCloseTo(0.5, 10);
		expect(point?.y).toBeCloseTo(0.5, 10);
	});

	it("北を向いているとき、東は右、天頂寄りは上に来る", () => {
		const basis = computeViewBasis(NORTH_HORIZON, 1);

		const east = projectToScreen(basis, Math.PI / 6, 0);
		const higher = projectToScreen(basis, 0, Math.PI / 6);

		expect(east?.x).toBeGreaterThan(0.5);
		expect(higher?.y).toBeLessThan(0.5);
	});

	it("カメラの後方の点は null を返す", () => {
		const basis = computeViewBasis(NORTH_HORIZON, 1);

		expect(projectToScreen(basis, Math.PI, 0)).toBeNull();
	});
});

describe("screenToDirection", () => {
	it("画面の中心は、カメラが下がっていても視線の方向を指す", () => {
		const basis = computeViewBasis({ ...NORTH_HORIZON, fov: MAX_FOV }, 1.6);

		const direction = screenToDirection(basis, { x: 0.5, y: 0.5 });

		for (const [axis, value] of basis.viewDir.entries()) {
			expect(direction[axis]).toBeCloseTo(value, 10);
		}
	});

	it("求めた方向を projectToScreen で投影すると元の画面上の点に戻る", () => {
		const basis = computeViewBasis({ azimuth: 1, altitude: 0.4, fov: MAX_FOV }, 1.6);
		const point = { x: 0.2, y: 0.7 };

		const [east, zenith, north] = screenToDirection(basis, point);
		const projected = projectToScreen(basis, Math.atan2(east, north), Math.asin(zenith));

		expect(projected?.x).toBeCloseTo(point.x, 10);
		expect(projected?.y).toBeCloseTo(point.y, 10);
	});
});
