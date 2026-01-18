/**
 * スカイライン（建物シルエット）テクスチャ生成
 *
 * 建物の高さを事前計算して1Dテクスチャに焼き込むことで、 フラグメントシェーダーでのループを排除してパフォーマンスを向上
 *
 * 空気遠近法を適用した3レイヤー構成：
 *
 * - 遠景（layer 0）：霞んだ青みグレー、低い建物
 * - 中景（layer 1）：暗いグレー、中程度の建物
 * - 前景（layer 2）：完全な黒、高い建物
 */

// スカイラインパラメータ
const BASE_HEIGHT_DEG = 1; // 最低の建物高さ（度）
const HEIGHT_AMPLITUDE_DEG = 5; // 高さの変動幅（度）
const FLOOR_QUANTIZE_DEG = 0.4; // 階数の刻み（度）
const BUILDING_WIDTH_MIN = 0.015; // 最小建物幅（ラジアン）
const BUILDING_WIDTH_MAX = 0.06; // 最大建物幅（ラジアン）
const BUILDING_SCALE = 80; // 建物数のスケール
const TWO_PI = Math.PI * 2;

/**
 * スカイラインテクスチャの解像度（方位角の分割数） 2048で十分な精度を確保（0.175度/ピクセル）
 */
export const SKYLINE_TEXTURE_WIDTH = 2048;

/**
 * スカイラインレイヤー数（空気遠近法用）
 */
export const SKYLINE_LAYER_COUNT = 3;

/**
 * 各レイヤーのパラメータ（遠景から前景へ）
 *
 * - AzimuthOffset: 方位角オフセット（ラジアン）- 建物パターンをずらす
 * - HeightScale: 高さの倍率（遠景は高め、前景は低め）
 * - Probability: 建物密度（遠景は疎、前景は密）
 * - WidthScale: 建物幅の倍率（遠景は細め、前景は太め）
 *
 * 遠景の高い建物が前景の低い建物の上に見えることで、 レイヤー間の奥行き感を表現する
 */
const LAYER_PARAMS = [
	{ azimuthOffset: 0, heightScale: 1, probability: 0.25, widthScale: 0.7 }, // 遠景：疎で細い高層ビル
	{ azimuthOffset: 0.15, heightScale: 0.8, probability: 0.35, widthScale: 0.9 }, // 中景：中程度
	{ azimuthOffset: 0.3, heightScale: 0.6, probability: 0.45, widthScale: 1.1 }, // 前景：密で太い低層建物
] as const;

/**
 * 正のmod（JavaScriptの%は負の値を返す可能性があるため）
 */
function fract(x: number): number {
	return x - Math.floor(x);
}

/**
 * 1Dハッシュ関数（正規化版）
 */
function hash11Normalized(p: number): number {
	const result = fract(Math.sin(p * 127.1) * 43_758.5453);
	return result < 0 ? result + 1 : result;
}

/**
 * 1Dノイズ関数（滑らかな補間）
 */
function noise1d(x: number): number {
	const i = Math.floor(x);
	const f = fract(x);
	const u = f * f * (3 - 2 * f);
	return hash11Normalized(i) * (1 - u) + hash11Normalized(i + 1) * u;
}

/**
 * 線形補間
 */
function mix(a: number, b: number, t: number): number {
	return a * (1 - t) + b * t;
}

interface LayerParams {
	azimuthOffset: number;
	heightScale: number;
	probability: number;
	widthScale: number;
}

/**
 * 指定した方位角での建物高さを計算（度単位で返す）
 *
 * @param azimuth 方位角（ラジアン）
 * @param params レイヤーごとのパラメータ
 */
function getBuildingHeight(azimuth: number, params: LayerParams): number {
	// 方位角オフセットを適用して正規化
	let normalizedAz =
		azimuth + params.azimuthOffset - Math.floor(azimuth / TWO_PI) * TWO_PI;
	if (normalizedAz < 0) {
		normalizedAz += TWO_PI;
	}
	if (normalizedAz >= TWO_PI) {
		normalizedAz -= TWO_PI;
	}

	// 累積ノイズで建物境界を決定
	const scaledX = normalizedAz * BUILDING_SCALE;

	// 建物インデックスを累積幅で計算
	let accum = 0;
	let buildingIdx = 0;

	for (let i = 0; i < 200; i += 1) {
		// 各建物の幅をノイズで決定（レイヤーごとの幅スケールを適用）
		const widthNoise = hash11Normalized(i * 17.3 + 0.5);
		const baseWidth = mix(BUILDING_WIDTH_MIN, BUILDING_WIDTH_MAX, widthNoise);
		const buildingWidth = baseWidth * params.widthScale * BUILDING_SCALE;

		if (accum + buildingWidth > scaledX) {
			buildingIdx = i;
			break;
		}
		accum += buildingWidth;
		buildingIdx = i;
	}

	// 建物が存在するかどうかをノイズで決定
	const clusterNoise = noise1d(buildingIdx * 0.08); // 街区のまとまり
	const existsNoise = hash11Normalized(buildingIdx * 73.9 + 0.3);

	// 街区が発展している場所では建物が建ちやすい（レイヤーごとの密度を適用）
	const localProbability = params.probability + clusterNoise * 0.25;

	if (existsNoise > localProbability) {
		// 建物がない場所：地平線レベル
		return 0;
	}

	// 建物の高さをノイズで決定
	const highFreq = hash11Normalized(buildingIdx * 31.7);

	// 高さを合成（街区のまとまりで高さも変わる）
	const rawHeight = clusterNoise * 0.5 + highFreq * 0.5;

	// 階数単位で量子化してビルらしいフラットな天端に
	const heightDeg = BASE_HEIGHT_DEG + rawHeight * HEIGHT_AMPLITUDE_DEG;
	const quantizedHeight =
		Math.floor(heightDeg / FLOOR_QUANTIZE_DEG) * FLOOR_QUANTIZE_DEG;

	// 空気遠近法：レイヤーごとの高さスケールを適用
	return quantizedHeight * params.heightScale;
}

/**
 * 指定レイヤーのスカイラインテクスチャデータを生成 方位角0〜2πにわたって建物高さを計算し、Float32配列として返す
 *
 * @param layerIndex レイヤーインデックス（0: 遠景, 1: 中景, 2: 前景）
 */
export function generateSkylineData(layerIndex: number): Float32Array {
	const data = new Float32Array(SKYLINE_TEXTURE_WIDTH);
	const params = LAYER_PARAMS[layerIndex];

	if (!params) {
		return data;
	}

	for (let i = 0; i < SKYLINE_TEXTURE_WIDTH; i += 1) {
		// 0〜1のUV座標から方位角を計算
		const u = i / SKYLINE_TEXTURE_WIDTH;
		const azimuth = u * TWO_PI;

		// 建物高さを度単位で取得（レイヤーごとのパラメータを使用）
		const heightDeg = getBuildingHeight(azimuth, params);

		// テクスチャに格納（度単位のまま）
		data[i] = heightDeg;
	}

	return data;
}

export interface SkylineResources {
	texture: GPUTexture;
	textureView: GPUTextureView;
}

/**
 * スカイラインテクスチャを作成（3レイヤー対応） テクスチャサイズ: 2048 x 3（各行がレイヤーに対応）
 */
export function createSkylineTexture(device: GPUDevice): SkylineResources {
	// 全レイヤーのデータを結合
	const combinedData = new Float32Array(
		SKYLINE_TEXTURE_WIDTH * SKYLINE_LAYER_COUNT,
	);

	for (let layer = 0; layer < SKYLINE_LAYER_COUNT; layer += 1) {
		const layerData = generateSkylineData(layer);
		combinedData.set(layerData, layer * SKYLINE_TEXTURE_WIDTH);
	}

	// 2Dテクスチャとして作成（高さ=レイヤー数）
	const texture = device.createTexture({
		label: "Skyline texture (3 layers)",
		size: { width: SKYLINE_TEXTURE_WIDTH, height: SKYLINE_LAYER_COUNT },
		format: "r32float",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
	});

	// テクスチャにデータを書き込み
	device.queue.writeTexture(
		{ texture },
		combinedData.buffer,
		{ bytesPerRow: SKYLINE_TEXTURE_WIDTH * 4 },
		{ width: SKYLINE_TEXTURE_WIDTH, height: SKYLINE_LAYER_COUNT },
	);

	const textureView = texture.createView();

	return { texture, textureView };
}

/**
 * スカイラインリソースを破棄
 */
export function destroySkylineTexture(
	resources: SkylineResources | null,
): void {
	if (!resources) return;
	resources.texture.destroy();
}
