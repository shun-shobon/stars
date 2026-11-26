import { describe, expect, it } from "vitest";

import { formatObserverDate, formatObserverTime } from "./format-observer-time";

const INSTANT = Temporal.Instant.from("2026-11-26T15:02:40Z");

describe("formatObserverDate", () => {
	it("日本時間の日付を年月日で表す", () => {
		expect(formatObserverDate(INSTANT)).toBe("2026年11月27日");
	});
});

describe("formatObserverTime", () => {
	it("日本時間の時刻を2桁ずつ表す", () => {
		expect(formatObserverTime(INSTANT)).toBe("00:02:40");
	});
});
