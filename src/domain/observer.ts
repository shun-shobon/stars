/**
 * 観測地（東京都庁付近）。
 */
export const OBSERVER = {
	latitudeRad: degreesToRadians(35.6895),
	longitudeDeg: 139.6917,
	timeZone: "Asia/Tokyo",
} as const;

// datetime-local の値は5桁以上の年をそのまま書くが、Temporal は4桁を超える年に符号付き6桁の拡張形式を求める
const HTML_EXPANDED_YEAR_PATTERN = /^(\d{5,6})-/u;
const ISO_EXPANDED_YEAR_PATTERN = /^\+0*(\d{4,})-/u;

export class ObserverTimeError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ObserverTimeError";
	}
}

/**
 * 観測地の現地時刻を `<input type="datetime-local">` の値（分単位）にする。
 */
export function toObserverDateTimeLocal(instant: Temporal.Instant): string {
	return instant
		.toZonedDateTimeISO(OBSERVER.timeZone)
		.toPlainDateTime()
		.toString({ smallestUnit: "minute" })
		.replace(ISO_EXPANDED_YEAR_PATTERN, "$1-");
}

/**
 * `<input type="datetime-local">` の値を観測地の現地時刻として解釈する。
 */
export function parseObserverDateTimeLocal(value: string): Temporal.Instant {
	const isoValue = value.replace(
		HTML_EXPANDED_YEAR_PATTERN,
		(_, year: string) => `+${year.padStart(6, "0")}-`,
	);

	try {
		return Temporal.PlainDateTime.from(isoValue).toZonedDateTime(OBSERVER.timeZone).toInstant();
	} catch (error) {
		if (!(error instanceof RangeError)) {
			throw error;
		}
		throw new ObserverTimeError(`Invalid datetime-local value: "${value}".`, { cause: error });
	}
}

function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}
