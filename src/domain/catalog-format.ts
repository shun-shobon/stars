/**
 * 星カタログのバイナリ形式。生成スクリプト、読み込み、シェーダーの頂点入力で共有する。
 * どのレコードも little-endian の float32 を4つ並べる。
 */

/** 赤経 [rad]、赤緯 [rad]、視等級、B-V 色指数 */
export const STAR_RECORD_BYTES = 16;

/** 始点の赤経・赤緯、終点の赤経・赤緯 [rad] */
export const CONSTELLATION_LINE_RECORD_BYTES = 16;
