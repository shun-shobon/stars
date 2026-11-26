import type { CameraState } from "./camera";
import { MAX_FOV, MIN_FOV } from "./camera";

type Vec3 = readonly [number, number, number];

/**
 * 天球（半径1の単位球）を見るカメラの基底と投影パラメーター。
 * 座標系は東を +X、天頂を +Y、北を +Z とする。
 */
export type ViewBasis = {
	viewDir: Vec3;
	right: Vec3;
	up: Vec3;
	/** 天球の中心からのカメラ位置 */
	position: Vec3;
	/** 幅 / 高さ */
	aspect: number;
	tanHalfFov: number;
	projectionScale: number;
	/** 視線方向からこの角度より離れた点は画面外として描画を省く */
	cullRadius: number;
};

export type ScreenPoint = {
	/** 画面左端を 0、右端を 1 とした位置 */
	x: number;
	/** 画面上端を 0、下端を 1 とした位置 */
	y: number;
};

/**
 * 最大視野角のときに視線の逆方向へ下がる距離（天球の半径比）。
 * 中心から見ると広角の端で歪みが大きくなるため、下がって全天を見渡しやすくする。
 */
const MAX_CAMERA_OFFSET = 0.5;

/** 画面のすぐ外にある点もラベルを出し、端で唐突に消えないようにする */
const SCREEN_MARGIN = 0.1;

/** 視野の対角方向まで含め、端の星が欠けないよう少し広めに取る */
const CULL_RADIUS_MARGIN = 1.1;

const WORLD_UP: Vec3 = [0, 1, 0];

export function computeViewBasis(camera: CameraState, aspect: number): ViewBasis {
	const viewDir = horizontalToCartesian(camera.azimuth, camera.altitude);
	const rawRight = cross(WORLD_UP, viewDir);
	const right: Vec3 = length(rawRight) < 0.001 ? [1, 0, 0] : normalize(rawRight);
	const up = normalize(cross(viewDir, right));

	const fovRatio = clamp01((camera.fov - MIN_FOV) / (MAX_FOV - MIN_FOV));
	const position = scale(viewDir, -fovRatio * MAX_CAMERA_OFFSET);

	const tanHalfFov = Math.tan(camera.fov / 2);
	const cullRadius = (camera.fov / 2) * Math.hypot(1, aspect) * CULL_RADIUS_MARGIN;

	return {
		viewDir,
		right,
		up,
		position,
		aspect,
		tanHalfFov,
		projectionScale: 1 / tanHalfFov,
		cullRadius,
	};
}

/**
 * 地平座標の点を画面上の位置に投影する。カメラの後方や画面から大きく外れる点は null を返す。
 */
export function projectToScreen(
	basis: ViewBasis,
	azimuth: number,
	altitude: number,
): ScreenPoint | null {
	const toTarget = normalize(subtract(horizontalToCartesian(azimuth, altitude), basis.position));
	const depth = dot(toTarget, basis.viewDir);
	if (depth <= 0) {
		return null;
	}

	const ndcX = ((dot(toTarget, basis.right) / depth) * basis.projectionScale) / basis.aspect;
	const ndcY = (dot(toTarget, basis.up) / depth) * basis.projectionScale;
	const x = (ndcX + 1) / 2;
	const y = (1 - ndcY) / 2;

	const isNearScreen =
		x >= -SCREEN_MARGIN && x <= 1 + SCREEN_MARGIN && y >= -SCREEN_MARGIN && y <= 1 + SCREEN_MARGIN;

	return isNearScreen ? { x, y } : null;
}

function horizontalToCartesian(azimuth: number, altitude: number): Vec3 {
	const cosAltitude = Math.cos(altitude);
	return [cosAltitude * Math.sin(azimuth), Math.sin(altitude), cosAltitude * Math.cos(azimuth)];
}

function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: Vec3, factor: number): Vec3 {
	return [v[0] * factor, v[1] * factor, v[2] * factor];
}

function length(v: Vec3): number {
	return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: Vec3): Vec3 {
	return scale(v, 1 / length(v));
}

function clamp01(value: number): number {
	return Math.min(Math.max(value, 0), 1);
}
