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
 * Uniform バッファサイズ（12 floats = 48 bytes、16バイトアライメントで48バイト）
 */
export const UNIFORM_BUFFER_SIZE = 48;

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
 * 星座線用Uniformバッファサイズ（12 floats）
 */
export const CONSTELLATION_UNIFORM_SIZE = 48;

/**
 * 操作ヒントの表示時間（ミリ秒）
 */
export const HINTS_DISPLAY_DURATION = 8000;
