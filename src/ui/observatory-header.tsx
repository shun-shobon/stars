import type { ReactNode } from "react";
import { useState } from "react";

import { parseObserverDateTimeLocal, toObserverDateTimeLocal } from "~/domain/observer";
import type { ObservationTime } from "~/viewer/start-starfield-viewer";

import { CornerOrnaments } from "./corner-ornaments";
import { formatObserverDate, formatObserverTime } from "./format-observer-time";
import { LayerToggle } from "./layer-toggle";
import { useNow } from "./use-now";

type ObservatoryHeaderProps = {
	observationTime: ObservationTime;
	onObservationTimeChange: (time: ObservationTime) => void;
	areConstellationsVisible: boolean;
	onConstellationsVisibleChange: (isVisible: boolean) => void;
	isMilkyWayVisible: boolean;
	onMilkyWayVisibleChange: (isVisible: boolean) => void;
	onError: (error: unknown) => void;
};

const LABEL_CLASS_NAME =
	"mb-0.5 text-[0.65rem] font-medium tracking-[0.12em] text-starlight-faint uppercase";
const DIVIDER_CLASS_NAME =
	"h-8 w-px bg-linear-to-b from-transparent via-celestial-gold/30 to-transparent sm:h-10";

/**
 * 観測日時・観測地・星座線と天の川の表示を並べた上部のパネル。日時は観測地の現地時刻で表示・入力する。
 */
export function ObservatoryHeader({
	observationTime,
	onObservationTimeChange,
	areConstellationsVisible,
	onConstellationsVisibleChange,
	isMilkyWayVisible,
	onMilkyWayVisibleChange,
	onError,
}: ObservatoryHeaderProps): ReactNode {
	const [isPickerOpen, setIsPickerOpen] = useState(false);
	const now = useNow();
	const instant = observationTime.kind === "fixed" ? observationTime.instant : now;

	return (
		<header className="pointer-events-none absolute inset-x-0 top-0 p-2 sm:p-3">
			<div className="animate-fade-in-up pointer-events-auto mx-auto w-fit [animation-delay:100ms]">
				<div className="panel-celestial px-3 py-2 sm:px-5 sm:py-3">
					<CornerOrnaments />

					<div className="flex items-center gap-2 whitespace-nowrap sm:gap-4">
						<div className="flex items-center gap-2 sm:gap-3">
							<p className="flex flex-col text-center sm:text-right">
								<span className="text-starlight-dim text-[10px] sm:text-xs">
									{formatObserverDate(instant)}
								</span>
								<time
									dateTime={instant.toString()}
									className="text-celestial-amber text-xs font-light tracking-[0.02em] tabular-nums sm:text-sm"
								>
									{formatObserverTime(instant)}
								</time>
							</p>

							<button
								type="button"
								onClick={() => {
									setIsPickerOpen(!isPickerOpen);
								}}
								className="button-celestial"
								aria-label="日付と時刻を変更"
								aria-expanded={isPickerOpen}
							>
								<span className="relative z-10">{isPickerOpen ? "閉じる" : "変更"}</span>
							</button>
						</div>

						<div className={DIVIDER_CLASS_NAME} />

						<p className="flex flex-col text-center">
							<span className={LABEL_CLASS_NAME}>観測地</span>
							<span className="font-display text-celestial-amber text-xs font-medium tracking-[0.04em] uppercase sm:text-sm">
								東京
							</span>
						</p>

						<div className={DIVIDER_CLASS_NAME} />

						<div className="flex items-center gap-2 sm:gap-3">
							<LayerToggle
								label="星座線"
								isOn={areConstellationsVisible}
								onChange={onConstellationsVisibleChange}
							/>
							<LayerToggle
								label="天の川"
								isOn={isMilkyWayVisible}
								onChange={onMilkyWayVisibleChange}
							/>
						</div>
					</div>

					{isPickerOpen && (
						<div className="animate-slide-down border-celestial-gold/20 mt-2 flex items-center gap-2 border-t pt-2 sm:mt-3 sm:pt-3">
							<input
								type="datetime-local"
								value={toObserverDateTimeLocal(instant)}
								onChange={(event) => {
									// 入力欄を空にしただけでは日時を選んだことにならない
									if (event.target.value === "") {
										return;
									}
									// イベントハンドラーで投げた例外はエラー表示に届かないので、呼び出し元へ渡す
									let selected: Temporal.Instant;
									try {
										selected = parseObserverDateTimeLocal(event.target.value);
									} catch (error) {
										onError(error);
										return;
									}
									onObservationTimeChange({ kind: "fixed", instant: selected });
								}}
								className="input-celestial flex-1"
								aria-label="日付と時刻（日本時間）を選択"
							/>
							<button
								type="button"
								onClick={() => {
									onObservationTimeChange({ kind: "realtime" });
									setIsPickerOpen(false);
								}}
								className="button-celestial"
								data-variant="primary"
							>
								<span className="relative z-10">現在</span>
							</button>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
