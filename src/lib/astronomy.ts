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
