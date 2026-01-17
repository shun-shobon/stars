/**
 * 天文計算関連のユーティリティ関数
 */

/**
 * 地方恒星時を計算
 *
 * @param date - 日時
 * @param longitude - 経度（度）
 * @returns 地方恒星時（ラジアン）
 */
export const calculateLocalSiderealTime = (
	date: Date,
	longitude: number,
): number => {
	// UTCでのユリウス日を計算
	const jd = date.getTime() / 86_400_000 + 2_440_587.5;
	const jd2000 = jd - 2_451_545;

	// グリニッジ平均恒星時（度）
	let gmst =
		280.460_618_37 +
		360.985_647_366_29 * jd2000 +
		0.000_387_933 * Math.pow(jd2000 / 36_525, 2);

	// 0-360度に正規化
	gmst = ((gmst % 360) + 360) % 360;

	// 地方恒星時（ラジアン）
	const lst = ((gmst + longitude) * Math.PI) / 180;
	return lst;
};

/**
 * 16方位の名称
 */
const DIRECTION_NAMES = [
	"北",
	"北北東",
	"北東",
	"東北東",
	"東",
	"東南東",
	"南東",
	"南南東",
	"南",
	"南南西",
	"南西",
	"西南西",
	"西",
	"西北西",
	"北西",
	"北北西",
] as const;

/**
 * 方位角から方角名を取得
 *
 * @param azimuth - 方位角（ラジアン）
 * @returns 16方位の日本語名
 */
export const getDirectionName = (azimuth: number): string => {
	let deg = ((azimuth * 180) / Math.PI) % 360;
	if (deg < 0) deg += 360;

	const index = Math.round(deg / 22.5) % 16;
	return DIRECTION_NAMES[index] ?? "不明";
};
