/**
 * 星空ヘッダーコンポーネント（日時表示・選択・観測地・星座線トグル）
 */

import type { FC } from "react";

import { formatDate, formatDateTimeLocal, formatTime } from "~/lib/format";

import { CornerOrnament } from "../ui/CornerOrnament";

export interface StarfieldHeaderProps {
	currentTime: Date;
	isDatePickerOpen: boolean;
	onDatePickerToggle: () => void;
	onDateTimeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onResetToNow: () => void;
	showConstellations: boolean;
	onToggleConstellations: () => void;
}

export const StarfieldHeader: FC<StarfieldHeaderProps> = ({
	currentTime,
	isDatePickerOpen,
	onDatePickerToggle,
	onDateTimeChange,
	onResetToNow,
	showConstellations,
	onToggleConstellations,
}) => {
	return (
		<header className="pointer-events-none absolute top-0 right-0 left-0 p-2 sm:p-3">
			<div className="animate-fade-in-up pointer-events-auto mx-auto w-fit opacity-0 delay-100">
				<div className="celestial-panel relative px-3 py-2 sm:px-5 sm:py-3">
					<CornerOrnament position="top-left" />
					<CornerOrnament position="top-right" />
					<CornerOrnament position="bottom-left" />
					<CornerOrnament position="bottom-right" />

					{/* 常に横並び */}
					<div className="flex items-center gap-3 sm:gap-4">
						{/* 日時表示 */}
						<div className="flex items-center gap-2 sm:gap-3">
							<div className="text-center sm:text-right">
								<p className="text-starlight-dim text-[10px] sm:text-xs">
									{formatDate(currentTime)}
								</p>
								<p className="text-celestial-amber text-data text-xs sm:text-sm">
									{formatTime(currentTime)}
								</p>
							</div>

							<button
								type="button"
								onClick={onDatePickerToggle}
								className="celestial-button px-2 py-1 text-[10px]"
								aria-label="日付と時刻を変更"
								aria-expanded={isDatePickerOpen}
							>
								<span className="relative z-10">
									{isDatePickerOpen ? "閉じる" : "変更"}
								</span>
							</button>
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

					{/* 日時選択パネル */}
					{isDatePickerOpen && (
						<div className="animate-slide-down border-celestial-gold/20 mt-2 border-t pt-2 sm:mt-3 sm:pt-3">
							<div className="flex items-center gap-2">
								<input
									type="datetime-local"
									value={formatDateTimeLocal(currentTime)}
									onChange={onDateTimeChange}
									className="celestial-input flex-1 px-2 py-1 text-xs"
									aria-label="日付と時刻を選択"
								/>
								<button
									type="button"
									onClick={onResetToNow}
									className="celestial-button celestial-button-primary px-2 py-1 text-[10px]"
								>
									<span className="relative z-10">現在</span>
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</header>
	);
};
