/**
 * カメラ制御の定数
 */

/**
 * ドラッグ感度
 */
export const DRAG_SENSITIVITY = 0.005;

/**
 * ズーム感度（マウスホイール用）
 */
export const ZOOM_SENSITIVITY = 0.001;

/**
 * ピンチズーム感度（タッチ操作用）
 */
export const PINCH_ZOOM_SENSITIVITY = 0.005;

/**
 * 初期方位角（ラジアン）- 北向き
 */
export const INITIAL_AZIMUTH = 0;

/**
 * 初期高度角（ラジアン）- 45度上向き
 */
export const INITIAL_ALTITUDE = Math.PI / 4;

/**
 * 初期視野角（ラジアン）- 90度
 */
export const INITIAL_FOV = Math.PI / 2;

/**
 * 最小視野角（ラジアン）- 30度
 */
export const MIN_FOV = Math.PI / 6;

/**
 * 最大視野角（ラジアン）- 120度
 */
export const MAX_FOV = (Math.PI * 2) / 3;

/**
 * 最小高度角（ラジアン）- 地平線の少し下
 */
export const MIN_ALTITUDE = -Math.PI / 2 + 0.1;

/**
 * 最大高度角（ラジアン）- 天頂の少し下
 */
export const MAX_ALTITUDE = Math.PI / 2 - 0.1;
