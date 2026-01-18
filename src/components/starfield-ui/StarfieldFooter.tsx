/**
 * 星空フッターコンポーネント（方角・高度表示）
 */

import type { FC } from "react";

import { formatDirectionJP } from "~/lib/format";

import { CornerOrnament } from "../ui/CornerOrnament";

export interface StarfieldFooterProps {
	direction: string;
	altitude: number;
	showConstellations: boolean;
	onToggleConstellations: () => void;
}

export const StarfieldFooter: FC<StarfieldFooterProps> = ({
	direction,
	altitude,
	showConstellations,
	onToggleConstellations,
}) => {
	return (
		<footer className="pointer-events-none absolute right-0 bottom-0 left-0 p-2 sm:p-3">
			<div className="animate-fade-in-up mx-auto w-fit opacity-0 delay-200">
				<div className="celestial-panel pointer-events-auto relative px-3 py-2 sm:px-5 sm:py-3">
					<CornerOrnament position="top-left" />
					<CornerOrnament position="top-right" />
					<CornerOrnament position="bottom-left" />
					<CornerOrnament position="bottom-right" />

					<div className="flex items-center gap-4 sm:gap-6">
						{/* 方角 */}
						<div className="text-center">
							<p className="text-label mb-0.5 text-[8px] sm:text-[9px]">方角</p>
							<p className="text-data text-celestial-light text-base sm:text-xl">
								{formatDirectionJP(direction)}
							</p>
						</div>

						<div className="celestial-divider-vertical h-8 sm:h-10" />

						{/* 高度 */}
						<div className="text-center">
							<p className="text-label mb-0.5 text-[8px] sm:text-[9px]">仰角</p>
							<p className="text-data text-celestial-light text-base sm:text-xl">
								{altitude.toFixed(1)}
								<span className="text-starlight-faint ml-0.5 text-[10px] sm:text-xs">
									°
								</span>
							</p>
						</div>

						<div className="celestial-divider-vertical h-8 sm:h-10" />

						{/* 観測地 */}
						<div className="text-center">
							<p className="text-label mb-0.5 text-[8px] sm:text-[9px]">
								観測地
							</p>
							<p className="text-display text-celestial-amber text-xs tracking-wider sm:text-sm">
								東京
							</p>
						</div>

						<div className="celestial-divider-vertical h-8 sm:h-10" />

						{/* 星座線トグル */}
						<button
							type="button"
							onClick={onToggleConstellations}
							className="group flex flex-col items-center text-center transition-opacity hover:opacity-100"
							aria-label={
								showConstellations ? "星座線を非表示" : "星座線を表示"
							}
							aria-pressed={showConstellations}
						>
							<p className="text-label mb-0.5 text-[8px] sm:text-[9px]">
								星座線
							</p>
							<div className="flex items-center gap-1.5">
								{/* トグルスイッチ */}
								<div
									className={`relative h-4 w-8 rounded-full border transition-all duration-300 ${
										showConstellations
											? "border-celestial-gold bg-celestial-gold/30"
											: "border-starlight-faint/40 bg-cosmic-night"
									}`}
								>
									<div
										className={`absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all duration-300 ${
											showConstellations
												? "bg-celestial-gold left-[18px] shadow-[0_0_6px_rgba(212,165,116,0.6)]"
												: "bg-starlight-faint left-0.5"
										}`}
									/>
								</div>
								{/* ステータステキスト */}
								<span
									className={`text-data text-xs transition-colors duration-300 sm:text-sm ${
										showConstellations
											? "text-celestial-light"
											: "text-starlight-faint"
									}`}
								>
									{showConstellations ? "ON" : "OFF"}
								</span>
							</div>
						</button>
					</div>
				</div>
			</div>
		</footer>
	);
};
