/**
 * Suspense fallback用ローディングインジケーター
 */

import { useAtomValue } from "jotai";
import type { FC } from "react";

import { loadingProgressAtom } from "~/atoms";

/**
 * 進捗表示付きのSuspense fallbackコンポーネント
 */
export const SuspenseLoadingIndicator: FC = () => {
	const progress = useAtomValue(loadingProgressAtom);

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
				<div className="flex flex-col items-center gap-2">
					<div className="loading-bar w-32">
						<div
							className="loading-bar-fill"
							style={{ width: `${progress.toString()}%` }}
						/>
					</div>
					<span className="text-starlight-faint text-xs tabular-nums">
						星空を読み込み中... {progress}%
					</span>
				</div>
			</div>
		</div>
	);
};
