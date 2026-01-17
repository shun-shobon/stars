/**
 * 星空フッターコンポーネント（方角・高度表示）
 */

import type { FC } from "react";

import { formatDirectionJP } from "~/lib/format";

import { CornerOrnament } from "../ui/CornerOrnament";

export interface StarfieldFooterProps {
	direction: string;
	altitude: number;
}

export const StarfieldFooter: FC<StarfieldFooterProps> = ({
	direction,
	altitude,
}) => {
	return (
		<footer className="pointer-events-none absolute right-0 bottom-0 left-0 p-2 sm:p-3">
			<div className="animate-fade-in-up mx-auto w-fit opacity-0 delay-200">
				<div className="celestial-panel relative px-3 py-2 sm:px-5 sm:py-3">
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
					</div>
				</div>
			</div>
		</footer>
	);
};
