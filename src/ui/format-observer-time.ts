import { OBSERVER } from "~/domain/observer";

// Intl.DateTimeFormat に Temporal の値を渡すと、Chrome 150 では month: "short" や hour: "2-digit" が無視されるため、フィールドから組み立てる

/** 例: 2026年11月27日 */
export function formatObserverDate(instant: Temporal.Instant): string {
	const { year, month, day } = instant.toZonedDateTimeISO(OBSERVER.timeZone);
	return `${year}年${month}月${day}日`;
}

/** 例: 00:02:40 */
export function formatObserverTime(instant: Temporal.Instant): string {
	const { hour, minute, second } = instant.toZonedDateTimeISO(OBSERVER.timeZone);
	return [hour, minute, second].map((value) => value.toString().padStart(2, "0")).join(":");
}
