/**
 * スカイライン（建物シルエット）テクスチャ生成
 *
 * 建物の高さを事前計算して1Dテクスチャに焼き込むことで、 フラグメントシェーダーでのループを排除してパフォーマンスを向上
 */

// スカイラインパラメータ（シェーダーと同じ値）
const BASE_HEIGHT_DEG = 1; // 最低の建物高さ（度）
const HEIGHT_AMPLITUDE_DEG = 5; // 高さの変動幅（度）
const FLOOR_QUANTIZE_DEG = 0.4; // 階数の刻み（度）
const BUILDING_WIDTH_MIN = 0.015; // 最小建物幅（ラジアン）
const BUILDING_WIDTH_MAX = 0.06; // 最大建物幅（ラジアン）
const BUILDING_SCALE = 80; // 建物数のスケール
const TWO_PI = Math.PI * 2;
const BUILDING_PROBABILITY = 0.35; // 建物が存在する確率（35%）

/**
 * スカイラインテクスチャの解像度（方位角の分割数） 2048で十分な精度を確保（0.175度/ピクセル）
 */
export const SKYLINE_TEXTURE_WIDTH = 2048;

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

/**
 * 指定した方位角での建物高さを計算（度単位で返す）
 */
function getBuildingHeight(azimuth: number): number {
	// 方位角を0〜2πに正規化
	let normalizedAz = azimuth - Math.floor(azimuth / TWO_PI) * TWO_PI;
	if (normalizedAz < 0) {
		normalizedAz += TWO_PI;
	}

	// 累積ノイズで建物境界を決定
	const scaledX = normalizedAz * BUILDING_SCALE;

	// 建物インデックスを累積幅で計算
	let accum = 0;
	let buildingIdx = 0;

	for (let i = 0; i < 200; i += 1) {
		const idx = i;
		// 各建物の幅をノイズで決定
		const widthNoise = hash11Normalized(idx * 17.3 + 0.5);
		const buildingWidth =
			mix(BUILDING_WIDTH_MIN, BUILDING_WIDTH_MAX, widthNoise) * BUILDING_SCALE;

		if (accum + buildingWidth > scaledX) {
			buildingIdx = idx;
			break;
		}
		accum += buildingWidth;
		buildingIdx = idx;
	}

	// 建物が存在するかどうかをノイズで決定
	const clusterNoise = noise1d(buildingIdx * 0.08); // 街区のまとまり
	const existsNoise = hash11Normalized(buildingIdx * 73.9 + 0.3);

	// 街区が発展している場所では建物が建ちやすい
	const localProbability = BUILDING_PROBABILITY + clusterNoise * 0.3;

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

	return quantizedHeight;
}

/**
 * スカイラインテクスチャデータを生成 方位角0〜2πにわたって建物高さを計算し、Float32配列として返す
 */
export function generateSkylineData(): Float32Array {
	const data = new Float32Array(SKYLINE_TEXTURE_WIDTH);

	for (let i = 0; i < SKYLINE_TEXTURE_WIDTH; i += 1) {
		// 0〜1のUV座標から方位角を計算
		const u = i / SKYLINE_TEXTURE_WIDTH;
		const azimuth = u * TWO_PI;

		// 建物高さを度単位で取得
		const heightDeg = getBuildingHeight(azimuth);

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
 * スカイラインテクスチャを作成
 */
export function createSkylineTexture(device: GPUDevice): SkylineResources {
	// テクスチャデータを生成
	const data = generateSkylineData();

	// 1Dテクスチャとして作成（高さ1の2Dテクスチャとして扱う）
	const texture = device.createTexture({
		label: "Skyline texture",
		size: { width: SKYLINE_TEXTURE_WIDTH, height: 1 },
		format: "r32float",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
	});

	// テクスチャにデータを書き込み
	device.queue.writeTexture(
		{ texture },
		data.buffer,
		{ bytesPerRow: SKYLINE_TEXTURE_WIDTH * 4 },
		{ width: SKYLINE_TEXTURE_WIDTH, height: 1 },
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
