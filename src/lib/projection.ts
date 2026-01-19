/**
 * 座標変換ユーティリティ starfield.ts の updateUniforms と同等のロジックをTypeScriptで実装
 */

import { MAX_CAMERA_OFFSET, MAX_FOV, MIN_FOV } from "~/constants";

type Vec3 = [number, number, number];

export interface ScreenPosition {
	/**
	 * X座標 (0〜1: 左〜右)
	 */
	x: number;
	/**
	 * Y座標 (0〜1: 上〜下)
	 */
	y: number;
	/**
	 * 視野内かどうか
	 */
	visible: boolean;
}

export interface CameraParams {
	/**
	 * カメラの方位角（ラジアン）
	 */
	azimuth: number;
	/**
	 * カメラの仰角（ラジアン）
	 */
	altitude: number;
	/**
	 * 視野角（ラジアン）
	 */
	fov: number;
	/**
	 * アスペクト比 (width/height)
	 */
	aspect: number;
}

/**
 * 地平座標から3Dベクトルへ変換 北=+Z, 東=+X, 上=+Y の座標系
 */
function horizontalToCartesian(azimuth: number, altitude: number): Vec3 {
	const cosAlt = Math.cos(altitude);
	return [
		cosAlt * Math.sin(azimuth), // X: 東方向
		Math.sin(altitude), // Y: 上方向
		cosAlt * Math.cos(azimuth), // Z: 北方向
	];
}

/**
 * ベクトルの長さ
 */
function length(v: Vec3): number {
	return Math.hypot(v[0], v[1], v[2]);
}

/**
 * ベクトルの正規化
 */
function normalize(v: Vec3): Vec3 {
	const len = length(v);
	if (len === 0) return [0, 0, 0];
	return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * ベクトルの内積
 */
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * ベクトルの外積
 */
function cross(a: Vec3, b: Vec3): Vec3 {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

/**
 * ベクトルの減算
 */
function subtract(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * 地平座標から画面座標へ変換
 *
 * @param targetAzimuth - 対象の方位角（ラジアン）
 * @param targetAltitude - 対象の仰角（ラジアン）
 * @param camera - カメラパラメータ
 * @returns 画面座標と可視性
 */
export function projectToScreen(
	targetAzimuth: number,
	targetAltitude: number,
	camera: CameraParams,
): ScreenPosition {
	// カメラの視線方向（starfield.ts と同じ計算）
	const viewDir = normalize(
		horizontalToCartesian(camera.azimuth, camera.altitude),
	);

	// カメラの右方向ベクトル（starfield.ts: cross(worldUp, viewDir)）
	const worldUp: Vec3 = [0, 1, 0];
	let right = cross(worldUp, viewDir);
	right = length(right) < 0.001 ? [1, 0, 0] : normalize(right);

	// カメラの上方向ベクトル（starfield.ts: cross(viewDir, right)）
	const up = normalize(cross(viewDir, right));

	// FOVに基づくカメラオフセット（広角時に後ろに下がる）
	const fovRatio = Math.max(
		0,
		Math.min(1, (camera.fov - MIN_FOV) / (MAX_FOV - MIN_FOV)),
	);
	const cameraOffset = fovRatio * MAX_CAMERA_OFFSET;
	const cameraPos: Vec3 = [
		-viewDir[0] * cameraOffset,
		-viewDir[1] * cameraOffset,
		-viewDir[2] * cameraOffset,
	];

	// ターゲットの3D位置（天球上、単位ベクトル）
	const targetPos = horizontalToCartesian(targetAzimuth, targetAltitude);

	// カメラからターゲットへのベクトル
	const toTarget = subtract(targetPos, cameraPos);
	const toTargetDist = length(toTarget);
	const toTargetDir: Vec3 = [
		toTarget[0] / toTargetDist,
		toTarget[1] / toTargetDist,
		toTarget[2] / toTargetDist,
	];

	// ターゲットが視線方向の前方にあるかチェック
	const dotProduct = dot(toTargetDir, viewDir);
	if (dotProduct <= 0) {
		return { x: 0, y: 0, visible: false };
	}

	// ターゲットを視線座標系に投影
	const x = dot(toTargetDir, right);
	const y = dot(toTargetDir, up);
	const z = dotProduct;

	// 透視投影
	const projScale = 1 / Math.tan(camera.fov / 2);
	const screenX = ((x / z) * projScale) / camera.aspect;
	const screenY = (y / z) * projScale;

	// NDC (-1〜1) を画面座標 (0〜1) に変換
	const normalizedX = (screenX + 1) / 2;
	const normalizedY = (1 - screenY) / 2; // Y軸は上下反転

	// 画面内に収まっているかチェック（マージンを追加）
	const margin = 0.1; // 10%のマージン
	const visible =
		normalizedX >= -margin &&
		normalizedX <= 1 + margin &&
		normalizedY >= -margin &&
		normalizedY <= 1 + margin;

	return {
		x: normalizedX,
		y: normalizedY,
		visible,
	};
}
