import { describe, expect, it } from "vitest";

import { ObserverTimeError, parseObserverDateTimeLocal, toObserverDateTimeLocal } from "./observer";

describe("toObserverDateTimeLocal", () => {
	it("UTC の時刻を日本時間の日付と時刻（分単位）にする", () => {
		const instant = Temporal.Instant.from("2026-11-26T15:02:40Z");

		const value = toObserverDateTimeLocal(instant);

		expect(value).toBe("2026-11-27T00:02");
	});

	it("4桁を超える年も datetime-local の形式で書く", () => {
		const instant = Temporal.Instant.from("+010000-01-01T00:00:00Z");

		const value = toObserverDateTimeLocal(instant);

		expect(value).toBe("10000-01-01T09:00");
	});
});

describe("parseObserverDateTimeLocal", () => {
	it.each([
		["2026-11-27T00:02", "2026-11-26T15:02:00Z"],
		["2026-11-27T00:02:30", "2026-11-26T15:02:30Z"],
		["10000-01-01T09:00", "+010000-01-01T00:00:00Z"],
	])("%s を日本時間として解釈する", (value, expected) => {
		const instant = parseObserverDateTimeLocal(value);

		expect(instant.toString()).toBe(expected);
	});

	it.each(["", "2026-13-01T00:00", "2026-11-27T00:02Z", "275761-01-01T00:00"])(
		"日時として解釈できない値 %j は ObserverTimeError にする",
		(value) => {
			expect(() => parseObserverDateTimeLocal(value)).toThrow(ObserverTimeError);
		},
	);
});
