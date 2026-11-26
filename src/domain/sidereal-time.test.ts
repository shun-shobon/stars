import { describe, expect, it } from "vitest";

import { localSiderealTime } from "./sidereal-time";

describe("localSiderealTime", () => {
	it("1987年4月10日0時UTのグリニッジ平均恒星時が13h10m46.3668sになる", () => {
		const instant = Temporal.Instant.from("1987-04-10T00:00:00Z");

		const lst = localSiderealTime(instant, 0);

		const expectedHours = 13 + 10 / 60 + 46.3668 / 3600;
		expect(radiansToHours(lst)).toBeCloseTo(expectedHours, 4);
	});

	it("東経の分だけ進んだ値を 0 以上 2π 未満で返す", () => {
		const instant = Temporal.Instant.from("1987-04-10T00:00:00Z");

		const greenwich = localSiderealTime(instant, 0);
		const east = localSiderealTime(instant, 180);

		expect(east).toBeGreaterThanOrEqual(0);
		expect(east).toBeLessThan(Math.PI * 2);
		expect(east).toBeCloseTo((greenwich + Math.PI) % (Math.PI * 2), 10);
	});
});

function radiansToHours(radians: number): number {
	return (radians * 12) / Math.PI;
}
