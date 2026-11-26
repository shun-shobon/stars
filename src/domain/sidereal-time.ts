const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JULIAN_DATE = 2_440_587.5;
const J2000_JULIAN_DATE = 2_451_545;
const DAYS_PER_JULIAN_CENTURY = 36_525;

/**
 * 地方平均恒星時をラジアン（0 以上 2π 未満）で返す。
 * IAU 1982 のグリニッジ平均恒星時の式を使う。
 */
export function localSiderealTime(instant: Temporal.Instant, longitudeDeg: number): number {
	const daysSinceJ2000 =
		instant.epochMilliseconds / MS_PER_DAY + UNIX_EPOCH_JULIAN_DATE - J2000_JULIAN_DATE;
	const centuriesSinceJ2000 = daysSinceJ2000 / DAYS_PER_JULIAN_CENTURY;

	const gmstDeg =
		280.460_618_37 + 360.985_647_366_29 * daysSinceJ2000 + 0.000_387_933 * centuriesSinceJ2000 ** 2;
	const lstDeg = (((gmstDeg + longitudeDeg) % 360) + 360) % 360;

	return (lstDeg * Math.PI) / 180;
}
