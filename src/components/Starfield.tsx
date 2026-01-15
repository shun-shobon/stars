/**
 * 星空表示コンポーネント
 */

import type { FC } from "react";
import { useEffect, useRef } from "react";

import { useStarfield } from "~/hooks/useStarfield";

const Starfield: FC = () => {
	const { canvasRef, direction, altitude, isLoading, error, currentTime } =
		useStarfield();

	const containerRef = useRef<HTMLDivElement>(null);

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
			month: "long",
			day: "numeric",
		});
	};

	if (error) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-gray-900">
				<div className="rounded-lg bg-red-900/50 p-6 text-center">
					<h2 className="mb-2 text-xl font-bold text-red-300">エラー</h2>
					<p className="text-red-200">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div ref={containerRef} className="relative h-screen w-screen">
			<canvas
				ref={canvasRef}
				className="absolute inset-0 cursor-grab active:cursor-grabbing"
				aria-label="東京からの星空表示。ドラッグで視点移動、ホイールでズーム"
			/>

			{/* ローディング表示 */}
			{isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
					<div className="text-center">
						<div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
						<p className="text-white">星空を読み込み中...</p>
					</div>
				</div>
			)}

			{/* 情報オーバーレイ */}
			{!isLoading && (
				<>
					{/* 上部情報 */}
					<div className="pointer-events-none absolute top-0 right-0 left-0 p-4">
						<div className="mx-auto max-w-md rounded-lg bg-black/50 p-4 text-center backdrop-blur-sm">
							<h1 className="mb-2 text-lg font-bold text-white">
								東京からの星空
							</h1>
							<p className="text-sm text-gray-300">
								{formatDate(currentTime)} {formatTime(currentTime)}
							</p>
						</div>
					</div>

					{/* 方角表示 */}
					<div className="pointer-events-none absolute right-0 bottom-0 left-0 p-4">
						<div className="mx-auto max-w-md rounded-lg bg-black/50 p-4 backdrop-blur-sm">
							<div className="flex items-center justify-between text-white">
								<div className="text-center">
									<p className="text-xs text-gray-400">方角</p>
									<p className="text-2xl font-bold">{direction}</p>
								</div>
								<div className="text-center">
									<p className="text-xs text-gray-400">高度</p>
									<p className="text-2xl font-bold">{altitude.toFixed(1)}°</p>
								</div>
								<div className="text-center">
									<p className="text-xs text-gray-400">観測地</p>
									<p className="text-lg font-bold">東京</p>
								</div>
							</div>
						</div>
					</div>

					{/* 操作説明 */}
					<div className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2">
						<div className="rounded-lg bg-black/30 p-3 text-xs text-gray-400 backdrop-blur-sm">
							<p className="mb-1">ドラッグ: 視点移動</p>
							<p>ホイール: ズーム</p>
						</div>
					</div>
				</>
			)}
		</div>
	);
};

export default Starfield;
