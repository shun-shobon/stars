import type { ReactNode } from "react";
import { useEffect, useState } from "react";

/** 操作を覚えるまでの間だけ出し、星空の邪魔にならないよう自動で消す */
const VISIBLE_DURATION_MS = 8000;

export function ControlHints(): ReactNode {
	const [isVisible, setIsVisible] = useState(true);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setIsVisible(false);
		}, VISIBLE_DURATION_MS);

		return () => {
			clearTimeout(timeoutId);
		};
	}, []);

	if (!isVisible) {
		return null;
	}

	return (
		<aside className="animate-fade-in pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 [animation-delay:400ms] sm:block">
			<div className="text-starlight-faint space-y-1 rounded-sm border border-white/5 bg-[rgb(10_10_18/0.6)] px-2.5 py-2 text-[10px] backdrop-blur-[20px]">
				<p className="flex items-center gap-1.5">
					<svg
						className="text-celestial-gold/50 size-3"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						aria-hidden="true"
					>
						<path d="M14 4h6v6M10 20H4v-6M21 3l-7 7M3 21l7-7" />
					</svg>
					ドラッグ: 視点移動
				</p>
				<p className="flex items-center gap-1.5">
					<svg
						className="text-celestial-gold/50 size-3"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						aria-hidden="true"
					>
						<rect x="5" y="2" width="14" height="20" rx="7" />
						<path d="M12 6v4" />
					</svg>
					ホイール: ズーム
				</p>
			</div>
		</aside>
	);
}
