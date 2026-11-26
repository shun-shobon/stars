const TWO_PI = Math.PI * 2;

/**
 * 地平座標系でのカメラの向きと視野。角度はすべてラジアン。
 */
export type CameraState = {
	/** 北を 0 として東回りに測った方位角 */
	azimuth: number;
	/** 地平線を 0 とした高度角 */
	altitude: number;
	/** 縦方向の視野角 */
	fov: number;
};

export const INITIAL_CAMERA: CameraState = {
	azimuth: 0,
	altitude: Math.PI / 4,
	fov: Math.PI / 2,
};

export const MIN_FOV = Math.PI / 6;
export const MAX_FOV = (Math.PI * 2) / 3;

/** 天頂・天底ちょうどを向くと右方向ベクトルが定まらないため、少し手前で止める */
const MIN_ALTITUDE = -Math.PI / 2 + 0.1;
const MAX_ALTITUDE = Math.PI / 2 - 0.1;

const DRAG_RADIANS_PER_PIXEL = 0.005;

/** 1周を2分で回る */
const AUTO_ROTATE_RADIANS_PER_SECOND = Math.PI / 60;

/**
 * 画面上のドラッグ量だけ視点を回す。右へドラッグすると空が右へ流れる向きに回る。
 */
export function dragCamera(camera: CameraState, dxPx: number, dyPx: number): CameraState {
	return {
		...camera,
		azimuth: normalizeAngle(camera.azimuth - dxPx * DRAG_RADIANS_PER_PIXEL),
		altitude: clamp(camera.altitude + dyPx * DRAG_RADIANS_PER_PIXEL, MIN_ALTITUDE, MAX_ALTITUDE),
	};
}

/**
 * 視野角を変える。正の値で広角になる。
 */
export function zoomCamera(camera: CameraState, deltaFov: number): CameraState {
	return {
		...camera,
		fov: clamp(camera.fov + deltaFov, MIN_FOV, MAX_FOV),
	};
}

export function autoRotateCamera(camera: CameraState, elapsedSeconds: number): CameraState {
	return {
		...camera,
		azimuth: normalizeAngle(camera.azimuth + AUTO_ROTATE_RADIANS_PER_SECOND * elapsedSeconds),
	};
}

function normalizeAngle(radians: number): number {
	return ((radians % TWO_PI) + TWO_PI) % TWO_PI;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
