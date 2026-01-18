/**
 * 星空ヘッダーコンポーネント（日時表示・選択）
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
}

export const StarfieldHeader: FC<StarfieldHeaderProps> = ({
	currentTime,
	isDatePickerOpen,
	onDatePickerToggle,
	onDateTimeChange,
	onResetToNow,
}) => {
	return (
		<header className="pointer-events-none absolute top-0 right-0 left-0 p-2 sm:p-3">
			<div className="animate-fade-in-up pointer-events-auto mx-auto w-fit opacity-0 delay-100">
				<div className="celestial-panel relative px-3 py-2 sm:px-5 sm:py-3">
					<CornerOrnament position="top-left" />
					<CornerOrnament position="top-right" />
					<CornerOrnament position="bottom-left" />
					<CornerOrnament position="bottom-right" />

					{/* モバイル: 縦並び、デスクトップ: 横並び */}
					<div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
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
