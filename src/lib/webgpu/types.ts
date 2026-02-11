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

/**
 * HDR設定
 */
export interface HdrConfig {
	/**
	 * HDR出力が有効かどうか
	 */
	enabled: boolean;
	/**
	 * トーンマッピングモード（0: SDR Reinhard, 1: HDR リニア/軽量）
	 */
	toneMappingMode: number;
}
