/**
 * 操作ヒントコンポーネント
 */

import type { FC } from "react";

export const StarfieldHints: FC = () => {
	return (
		<aside className="animate-fade-in pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 opacity-0 delay-400 sm:block">
			<div className="glass-cosmic rounded-sm px-2.5 py-2">
				<div className="text-starlight-faint space-y-1 text-[10px]">
					<div className="flex items-center gap-1.5">
						<svg
							className="text-celestial-gold/50 h-3 w-3"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							aria-hidden="true"
						>
							<path d="M14 4h6v6M10 20H4v-6M21 3l-7 7M3 21l7-7" />
						</svg>
						<span>ドラッグ: 視点移動</span>
					</div>
					<div className="flex items-center gap-1.5">
						<svg
							className="text-celestial-gold/50 h-3 w-3"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							aria-hidden="true"
						>
							<rect x="5" y="2" width="14" height="20" rx="7" />
							<path d="M12 6v4" />
						</svg>
						<span>ホイール: ズーム</span>
					</div>
				</div>
			</div>
		</aside>
	);
};
