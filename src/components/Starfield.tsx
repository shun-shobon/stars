/**
 * 星空表示コンポーネント Celestial Observatory Design
 */

import type { FC } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { HINTS_DISPLAY_DURATION, MAX_DEVICE_PIXEL_RATIO } from "~/constants";
import { useStarfield } from "~/hooks/useStarfield";

import {
	StarfieldFooter,
	StarfieldHeader,
	StarfieldHints,
} from "./starfield-ui";
import { ErrorPanel, LoadingIndicator } from "./ui";

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
		setRealtimeMode,
		showConstellations,
		setShowConstellations,
	} = useStarfield();

	const containerRef = useRef<HTMLDivElement>(null);
	const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
	const [showHints, setShowHints] = useState(true);

	// 操作ヒントを一定時間後に非表示
	useEffect(() => {
		const timer = setTimeout(() => {
			setShowHints(false);
		}, HINTS_DISPLAY_DURATION);

		return () => {
			clearTimeout(timer);
		};
	}, []);

	// 日付・時刻変更ハンドラー（指定時刻モードに切り替え）
	const handleDateTimeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>): void => {
			const newDate = new Date(e.target.value);
			if (!Number.isNaN(newDate.getTime())) {
				setRealtimeMode(false);
				setCurrentTime(newDate);
			}
		},
		[setCurrentTime, setRealtimeMode],
	);

	// 現在時刻にリセット（リアルタイムモードに戻す）
	const handleResetToNow = useCallback((): void => {
		setRealtimeMode(true);
		setCurrentTime(new Date());
		setIsDatePickerOpen(false);
	}, [setCurrentTime, setRealtimeMode]);

	// 日時ピッカーの開閉
	const handleDatePickerToggle = useCallback((): void => {
		setIsDatePickerOpen((prev) => !prev);
	}, []);

	// 星座線トグル
	const handleToggleConstellations = useCallback((): void => {
		setShowConstellations(!showConstellations);
	}, [showConstellations, setShowConstellations]);

	// キャンバスサイズをウィンドウに合わせる（DPR上限を適用）
	useEffect(() => {
		const updateSize = (): void => {
			const canvas = canvasRef.current;
			if (!canvas) return;

			// DPRに上限を設定（メモリ/帯域節約）
			const dpr = Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO);
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

	// エラー表示
	if (error) {
		return <ErrorPanel message={error} />;
	}

	return (
		<div ref={containerRef} className="bg-cosmic-void relative h-svh w-svw">
			{/* 星空キャンバス */}
			<canvas
				ref={canvasRef}
				className="absolute inset-0 cursor-grab active:cursor-grabbing"
				aria-label="東京からの星空表示。ドラッグで視点移動、ホイールでズーム"
			/>

			{/* ローディング表示 */}
			{isLoading && <LoadingIndicator progress={loadingProgress} />}

			{/* ヘッダーパネル */}
			<StarfieldHeader
				currentTime={currentTime}
				isDatePickerOpen={isDatePickerOpen}
				onDatePickerToggle={handleDatePickerToggle}
				onDateTimeChange={handleDateTimeChange}
				onResetToNow={handleResetToNow}
			/>

			{/* フッターパネル */}
			<StarfieldFooter
				direction={direction}
				altitude={altitude}
				showConstellations={showConstellations}
				onToggleConstellations={handleToggleConstellations}
			/>

			{/* 操作ヒント */}
			{showHints && <StarfieldHints />}
		</div>
	);
};

export default Starfield;
