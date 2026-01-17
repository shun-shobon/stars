/**
 * エラー表示パネルコンポーネント
 */

import type { FC } from "react";

import { CornerOrnament } from "./CornerOrnament";

export interface ErrorPanelProps {
	message: string;
}

export const ErrorPanel: FC<ErrorPanelProps> = ({ message }) => {
	return (
		<div className="bg-cosmic-void flex h-screen w-screen items-center justify-center">
			<div className="error-panel animate-fade-in-up relative max-w-sm rounded-sm p-6 text-center">
				<CornerOrnament position="top-left" />
				<CornerOrnament position="top-right" />
				<CornerOrnament position="bottom-left" />
				<CornerOrnament position="bottom-right" />

				<div className="mb-3">
					<svg
						className="mx-auto h-8 w-8 text-red-400/80"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 8v4M12 16h.01" />
					</svg>
				</div>

				<h2 className="text-display text-celestial-light mb-2 text-sm tracking-wider">
					観測エラー
				</h2>
				<p className="text-starlight-dim text-xs leading-relaxed">{message}</p>
			</div>
		</div>
	);
};
