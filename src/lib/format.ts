/**
 * フォーマット関連のユーティリティ関数
 */

/**
 * 時刻をフォーマット (HH:MM:SS)
 */
export const formatTime = (date: Date): string => {
	return date.toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
};

/**
 * 日付をフォーマット (YYYY年M月D日)
 */
export const formatDate = (date: Date): string => {
	return date.toLocaleDateString("ja-JP", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

/**
 * 日付をdatetime-local形式に変換
 */
export const formatDateTimeLocal = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day}T${hours}:${minutes}`;
};
