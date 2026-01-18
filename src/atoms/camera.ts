/**
 * カメラ状態のatoms
 */

import { atom } from "jotai";

import { INITIAL_ALTITUDE, INITIAL_AZIMUTH, INITIAL_FOV } from "~/constants";
import { getDirectionName } from "~/lib/astronomy";
import type { CameraState } from "~/lib/webgpu/types";

/**
 * カメラ状態（方位角、高度角、視野角）
 */
export const cameraAtom = atom<CameraState>({
	azimuth: INITIAL_AZIMUTH,
	altitude: INITIAL_ALTITUDE,
	fov: INITIAL_FOV,
});

/**
 * 方角名（派生atom）
 */
export const directionAtom = atom((get) =>
	getDirectionName(get(cameraAtom).azimuth),
);

/**
 * 高度角（度数、派生atom）
 */
export const altitudeDegreesAtom = atom(
	(get) => (get(cameraAtom).altitude * 180) / Math.PI,
);
