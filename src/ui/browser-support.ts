/**
 * 星空の表示に必須で、まだ実装していないブラウザーがある機能のうち、欠けているものの名前を返す。
 */
export function findMissingBrowserFeatures(): string[] {
	const missing: string[] = [];
	if (!("gpu" in navigator)) {
		missing.push("WebGPU");
	}
	if (!("Temporal" in globalThis)) {
		missing.push("Temporal");
	}
	return missing;
}
