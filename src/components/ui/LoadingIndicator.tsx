/**
 * ローディングインジケーターコンポーネント
 */

import type { FC } from "react";

export interface LoadingIndicatorProps {
	progress: number;
}

export const LoadingIndicator: FC<LoadingIndicatorProps> = ({ progress }) => {
	return (
		<div className="animate-fade-in pointer-events-none absolute right-2 bottom-20 sm:right-3 sm:bottom-3">
			<div className="glass-cosmic flex items-center gap-3 rounded-sm px-3 py-2">
				<svg
					className="text-celestial-gold animate-pulse-glow h-4 w-4"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d="M12 2L14.09 8.26L21 9.27L16 13.97L17.18 21L12 17.77L6.82 21L8 13.97L3 9.27L9.91 8.26L12 2Z" />
				</svg>
				<div className="flex items-center gap-2">
					<div className="loading-bar w-20">
						<div
							className="loading-bar-fill"
							style={{ width: `${progress.toString()}%` }}
						/>
					</div>
					<span className="text-starlight-faint text-xs tabular-nums">
						{progress}%
					</span>
				</div>
			</div>
		</div>
	);
};
