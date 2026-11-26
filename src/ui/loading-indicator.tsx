import type { ReactNode } from "react";

type LoadingIndicatorProps = {
	/** 0〜100 */
	progress: number;
};

export function LoadingIndicator({ progress }: LoadingIndicatorProps): ReactNode {
	return (
		<div className="animate-fade-in pointer-events-none absolute right-2 bottom-20 sm:right-3 sm:bottom-3">
			{/* 見た目のバーは幅をアニメーションさせるため div で描き、支援技術には progress で伝える */}
			<progress
				className="sr-only"
				value={progress}
				max={100}
				aria-label="星のデータを読み込み中"
			/>
			<div
				aria-hidden="true"
				className="flex items-center gap-3 rounded-sm border border-white/5 bg-[rgb(10_10_18/0.6)] px-3 py-2 backdrop-blur-[20px]"
			>
				<svg
					className="animate-pulse-glow text-celestial-gold size-4"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d="M12 2L14.09 8.26L21 9.27L16 13.97L17.18 21L12 17.77L6.82 21L8 13.97L3 9.27L9.91 8.26L12 2Z" />
				</svg>
				<div className="flex items-center gap-2">
					<div className="bg-celestial-gold/20 relative h-0.5 w-20 overflow-hidden rounded-[1px]">
						<div
							className="from-celestial-gold to-celestial-light ease-celestial absolute inset-y-0 left-0 rounded-[1px] bg-linear-to-r transition-[width] duration-300"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<span className="text-starlight-faint text-xs tabular-nums">{progress}%</span>
				</div>
			</div>
		</div>
	);
}
