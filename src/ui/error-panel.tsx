import type { ReactNode } from "react";

import { CornerOrnaments } from "./corner-ornaments";

type ErrorPanelProps = {
	message: string;
	/** 開発者向けの詳しい原因 */
	detail?: string;
};

export function ErrorPanel({ message, detail }: ErrorPanelProps): ReactNode {
	return (
		<div className="bg-cosmic-void flex h-svh w-svw items-center justify-center">
			<div
				role="alert"
				className="animate-fade-in-up relative max-w-sm rounded-sm border border-[rgb(200_80_80/0.3)] bg-linear-135 from-[rgb(60_20_20/0.9)] to-[rgb(40_15_15/0.95)] p-6 text-center"
			>
				<CornerOrnaments />

				<svg
					className="mx-auto mb-3 size-8 text-red-400/80"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 8v4M12 16h.01" />
				</svg>

				<h2 className="font-display text-celestial-light mb-2 text-sm font-medium tracking-[0.04em] uppercase">
					観測エラー
				</h2>
				<p className="text-starlight-dim text-xs leading-relaxed">{message}</p>
				{detail != null && (
					<p className="text-starlight-faint mt-3 font-mono text-[10px] break-all">{detail}</p>
				)}
			</div>
		</div>
	);
}
