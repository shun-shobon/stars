/**
 * カメラ状態のatoms
 */

import { atom } from "jotai";

import { INITIAL_ALTITUDE, INITIAL_AZIMUTH, INITIAL_FOV } from "~/constants";
import type { CameraState } from "~/lib/webgpu/types";

/**
 * カメラ状態（方位角、高度角、視野角）
 */
export const cameraAtom = atom<CameraState>({
	azimuth: INITIAL_AZIMUTH,
	altitude: INITIAL_ALTITUDE,
	fov: INITIAL_FOV,
});
