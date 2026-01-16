/**
 * 星空表示コンポーネント Celestial Observatory Design
 */

import type { FC } from "react";
import { useEffect, useRef, useState } from "react";

import { useStarfield } from "~/hooks/useStarfield";

/**
 * 方角を日本語に変換
 */
const formatDirectionJP = (direction: string): string => {
	const directionMap: Record<string, string> = {
		N: "北",
		NE: "北東",
		E: "東",
		SE: "南東",
		S: "南",
		SW: "南西",
		W: "西",
		NW: "北西",
	};
	return directionMap[direction] ?? direction;
};

/**
 * 装飾コーナーコンポーネント（コンパクト版）
 */
const CornerOrnament: FC<{
	position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}> = ({ position }) => {
	const positionClasses = {
		"top-left": "top-1.5 left-1.5",
		"top-right": "top-1.5 right-1.5 rotate-90",
		"bottom-left": "bottom-1.5 left-1.5 -rotate-90",
		"bottom-right": "bottom-1.5 right-1.5 rotate-180",
	};

	return (
		<svg
			className={`absolute h-3 w-3 ${positionClasses[position]}`}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1"
			aria-hidden="true"
		>
			<path d="M1 1 L1 8 M1 1 L8 1" className="text-celestial-gold/40" />
		</svg>
	);
};

const Starfield: FC = () => {
	const {
		canvasRef,
		direction,
		altitude,
		isLoading,
		loadingProgress,
		error,
		currentTime,
		setCurrentTime,
	} = useStarfield();

	const containerRef = useRef<HTMLDivElement>(null);
	const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
	const [showHints, setShowHints] = useState(true);

	// 操作ヒントを一定時間後に非表示
	useEffect(() => {
		const timer = setTimeout(() => {
			setShowHints(false);
		}, 8000);

		return () => {
			clearTimeout(timer);
		};
	}, []);

	// 日付・時刻変更ハンドラー
	const handleDateTimeChange = (
		e: React.ChangeEvent<HTMLInputElement>,
	): void => {
		const newDate = new Date(e.target.value);
		if (!Number.isNaN(newDate.getTime())) {
			setCurrentTime(newDate);
		}
	};

	// 現在時刻にリセット
	const handleResetToNow = (): void => {
		setCurrentTime(new Date());
		setIsDatePickerOpen(false);
	};

	// 日付をdatetime-local形式に変換
	const formatDateTimeLocal = (date: Date): string => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	};

	// キャンバスサイズをウィンドウに合わせる
	useEffect(() => {
		const updateSize = (): void => {
			const canvas = canvasRef.current;
			if (!canvas) return;

			const dpr = window.devicePixelRatio;
			canvas.width = window.innerWidth * dpr;
			canvas.height = window.innerHeight * dpr;
			canvas.style.width = `${window.innerWidth.toString()}px`;
			canvas.style.height = `${window.innerHeight.toString()}px`;
		};

		updateSize();
		window.addEventListener("resize", updateSize);
		return () => {
			window.removeEventListener("resize", updateSize);
		};
	}, [canvasRef]);

	// 時刻のフォーマット
	const formatTime = (date: Date): string => {
		return date.toLocaleTimeString("ja-JP", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	};

	const formatDate = (date: Date): string => {
		return date.toLocaleDateString("ja-JP", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	// エラー表示
	if (error) {
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
					<p className="text-starlight-dim text-xs leading-relaxed">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="bg-cosmic-void relative h-screen w-screen"
		>
			{/* 星空キャンバス */}
			<canvas
				ref={canvasRef}
				className="absolute inset-0 cursor-grab active:cursor-grabbing"
				aria-label="東京からの星空表示。ドラッグで視点移動、ホイールでズーム"
			/>

			{/* ローディング表示（右下配置） */}
			{isLoading && (
				<div className="animate-fade-in pointer-events-none absolute right-2 bottom-20 sm:right-3 sm:bottom-3">
					<div className="glass-cosmic flex items-center gap-3 rounded-sm px-3 py-2">
						<svg
							className="text-celestial-gold animate-pulse-glow h-4 w-4"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M12 2L14.09 8.26L21 9.27L16 13.97L17.18 21L12 17.77L6.82 21L8 13.97L3 9.27L9.91 8.26L12 2Z" />
						</svg>
						<div className="flex items-center gap-2">
							<div className="loading-bar w-20">
								<div
									className="loading-bar-fill"
									style={{ width: `${loadingProgress.toString()}%` }}
								/>
							</div>
							<span className="text-starlight-faint text-xs tabular-nums">
								{loadingProgress}%
							</span>
						</div>
					</div>
				</div>
			)}

			{/* ヘッダーパネル */}
			<header className="pointer-events-none absolute top-0 right-0 left-0 p-2 sm:p-3">
				<div className="animate-fade-in-up pointer-events-auto mx-auto w-fit opacity-0 delay-100">
					<div className="celestial-panel relative px-3 py-2 sm:px-5 sm:py-3">
						<CornerOrnament position="top-left" />
						<CornerOrnament position="top-right" />
						<CornerOrnament position="bottom-left" />
						<CornerOrnament position="bottom-right" />

						{/* モバイル: 縦並び、デスクトップ: 横並び */}
						<div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
							{/* タイトル */}
							<h1 className="text-display text-gradient-gold text-xs tracking-widest sm:text-sm">
								東京の星空
							</h1>

							<div className="celestial-divider hidden h-6 sm:block sm:w-px" />
							<div className="celestial-divider w-16 sm:hidden" />

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
									onClick={() => {
										setIsDatePickerOpen(!isDatePickerOpen);
									}}
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
										onChange={handleDateTimeChange}
										className="celestial-input flex-1 px-2 py-1 text-xs"
										aria-label="日付と時刻を選択"
									/>
									<button
										type="button"
										onClick={handleResetToNow}
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

			{/* フッターパネル - 観測データ */}
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
								<p className="text-label mb-0.5 text-[8px] sm:text-[9px]">
									方角
								</p>
								<p className="text-data text-celestial-light text-base sm:text-xl">
									{formatDirectionJP(direction)}
								</p>
							</div>

							<div className="celestial-divider-vertical h-8 sm:h-10" />

							{/* 高度 */}
							<div className="text-center">
								<p className="text-label mb-0.5 text-[8px] sm:text-[9px]">
									仰角
								</p>
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

			{/* 操作ヒント（モバイルでは非表示） */}
			{showHints && (
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
			)}
		</div>
	);
};

export default Starfield;
