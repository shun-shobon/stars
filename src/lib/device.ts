/**
 * デバイス検出とパフォーマンスプロファイル
 */

import starsMeta from "~/data/stars-meta.json";

/**
 * パフォーマンスプロファイル
 */
export interface PerformanceProfile {
	/**
	 * 最大描画星数
	 */
	maxStars: number;
	/**
	 * ブルームイテレーション回数
	 */
	bloomIterations: number;
	/**
	 * ブルームテクスチャのダウンスケール（1/n）
	 */
	bloomDownscale: number;
	/**
	 * ブラータップ数（5 or 9）
	 */
	blurTaps: 5 | 9;
	/**
	 * テクスチャフォーマット
	 */
	textureFormat: "rgba16float" | "rgba8unorm";
	/**
	 * 最大描画等級（この値より暗い星は描画しない）
	 */
	maxMagnitude: number;
}

/**
 * デバイスタイプ
 */
export type DeviceType = "mobile" | "tablet" | "desktop";

/**
 * デバイスタイプを検出
 */
export function detectDeviceType(): DeviceType {
	// User Agentベースの検出
	const ua = navigator.userAgent.toLowerCase();

	// モバイルデバイスのパターン
	const mobilePatterns = [
		/android.*mobile/u,
		/iphone/u,
		/ipod/u,
		/windows phone/u,
		/blackberry/u,
	];

	// タブレットデバイスのパターン
	const tabletPatterns = [/ipad/u, /android(?!.*mobile)/u, /tablet/u];

	// モバイルチェック
	for (const pattern of mobilePatterns) {
		if (pattern.test(ua)) {
			return "mobile";
		}
	}

	// タブレットチェック
	for (const pattern of tabletPatterns) {
		if (pattern.test(ua)) {
			return "tablet";
		}
	}

	// 画面サイズベースの追加チェック
	const width = window.innerWidth;
	const height = window.innerHeight;
	const minDimension = Math.min(width, height);

	if (minDimension < 768) {
		return "mobile";
	}
	if (minDimension < 1024) {
		return "tablet";
	}

	return "desktop";
}

/**
 * パフォーマンスプロファイルを取得
 */
export function getPerformanceProfile(
	deviceType?: DeviceType,
): PerformanceProfile {
	const type = deviceType ?? detectDeviceType();
	const totalStars = starsMeta.starCount;

	switch (type) {
		case "mobile":
			return {
				maxStars: 30_000, // 約1/4に削減
				bloomIterations: 2, // 5 → 2に削減
				bloomDownscale: 4, // 1/2 → 1/4に変更
				blurTaps: 5, // 9 → 5に削減
				textureFormat: "rgba8unorm", // メモリ帯域を削減
				maxMagnitude: 6.5, // 6.5等星まで（肉眼の限界）
			};
		case "tablet":
			return {
				maxStars: 60_000, // 約1/2に削減
				bloomIterations: 3, // 5 → 3に削減
				bloomDownscale: 2, // 1/2のまま
				blurTaps: 5, // 9 → 5に削減
				textureFormat: "rgba16float", // 品質を保持
				maxMagnitude: 8, // より暗い星まで表示
			};
		case "desktop":
			return {
				maxStars: totalStars, // 全て表示
				bloomIterations: 3, // 5 → 3に削減（デスクトップでも少し軽く）
				bloomDownscale: 2, // 1/2のまま
				blurTaps: 9, // 9のまま
				textureFormat: "rgba16float", // 高品質
				maxMagnitude: 14, // 全ての星を表示
			};
	}
}
