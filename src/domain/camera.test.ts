import { describe, expect, it } from "vitest";

import type { CameraState } from "./camera";
import {
	autoRotateCamera,
	dragCamera,
	INITIAL_CAMERA,
	MAX_FOV,
	MIN_FOV,
	zoomCamera,
} from "./camera";

describe("dragCamera", () => {
	it("右へのドラッグで方位角が減り、0 を下回ると 2π 側に回り込む", () => {
		const camera: CameraState = { ...INITIAL_CAMERA, azimuth: 0 };

		const dragged = dragCamera(camera, 100, 0);

		expect(dragged.azimuth).toBeCloseTo(Math.PI * 2 - 0.5, 10);
	});

	it("高度角は天頂と天底の手前で止まる", () => {
		const up = dragCamera(INITIAL_CAMERA, 0, 10_000);
		const down = dragCamera(INITIAL_CAMERA, 0, -10_000);

		expect(up.altitude).toBeCloseTo(Math.PI / 2 - 0.1, 10);
		expect(down.altitude).toBeCloseTo(-Math.PI / 2 + 0.1, 10);
	});
});

describe("zoomCamera", () => {
	it.each([
		[10, MAX_FOV],
		[-10, MIN_FOV],
	])("視野角の変化量 %d は上下限で止まる", (deltaFov, expected) => {
		const zoomed = zoomCamera(INITIAL_CAMERA, deltaFov);

		expect(zoomed.fov).toBe(expected);
	});
});

describe("autoRotateCamera", () => {
	it("2分で1周して元の方位角に戻る", () => {
		const rotated = autoRotateCamera({ ...INITIAL_CAMERA, azimuth: 1 }, 120);

		expect(rotated.azimuth).toBeCloseTo(1, 10);
	});
});
