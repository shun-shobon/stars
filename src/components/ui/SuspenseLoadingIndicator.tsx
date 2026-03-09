/**
 * Suspense fallback用ローディングインジケーター
 */

import type { FC } from "react";

/**
 * シンプルなSuspense fallbackコンポーネント
 */
export const SuspenseLoadingIndicator: FC = () => {
	return (
		<div className="bg-cosmic-void flex h-svh w-svw items-center justify-center">
			<div className="glass-cosmic flex flex-col items-center gap-4 rounded-sm px-8 py-6">
				<svg
					className="text-celestial-gold animate-pulse-glow h-8 w-8"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d="M12 2L14.09 8.26L21 9.27L16 13.97L17.18 21L12 17.77L6.82 21L8 13.97L3 9.27L9.91 8.26L12 2Z" />
				</svg>
				<span className="text-starlight-faint text-sm">読み込み中...</span>
			</div>
		</div>
	);
};
