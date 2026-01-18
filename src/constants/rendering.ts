/**
 * レンダリング関連の定数
 */

/**
 * ブルームのイテレーション回数
 */
export const BLOOM_ITERATIONS = 4;

/**
 * ブルームテクスチャの解像度スケール（1 = フル, 0.5 = 半分, 0.25 = 1/4）
 */
export const BLOOM_RESOLUTION_SCALE = 0.5;

/**
 * デバイスピクセル比の上限
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * 星シェーダー用Uniform バッファサイズ（24 floats = 96 bytes）
 */
export const UNIFORM_BUFFER_SIZE = 96;

/**
 * 1星あたりのバイト数（4 floats）
 */
export const BYTES_PER_STAR = 16;

/**
 * 1星座線あたりのバイト数（4 floats: ra1, dec1, ra2, dec2）
 */
export const BYTES_PER_CONSTELLATION_LINE = 16;

/**
 * 星座線の太さ（NDC単位）
 */
export const CONSTELLATION_LINE_WIDTH = 0.002;

/**
 * 星座線の透明度
 */
export const CONSTELLATION_LINE_ALPHA = 0.6;

/**
 * 星座線用Uniformバッファサイズ（24 floats = 96 bytes）
 */
export const CONSTELLATION_UNIFORM_SIZE = 96;

/**
 * カメラ共通Uniformバッファサイズ（20 floats = 80 bytes）
 */
export const CAMERA_UNIFORM_SIZE = 80;

/**
 * 操作ヒントの表示時間（ミリ秒）
 */
export const HINTS_DISPLAY_DURATION = 8000;
