/**
 * WebGPU関連の型定義
 */

export interface StarfieldMeta {
	starCount: number;
	minMagnitude: number;
	maxMagnitude: number;
	minBV: number;
	maxBV: number;
}

export type LoadProgressCallback = (
	progress: number,
	loadedCount: number,
) => void;

export interface CameraState {
	/**
	 * 方位角 (ラジアン)
	 */
	azimuth: number;
	/**
	 * 高度角 (ラジアン)
	 */
	altitude: number;
	/**
	 * 視野角 (ラジアン)
	 */
	fov: number;
}
