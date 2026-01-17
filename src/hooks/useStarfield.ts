/**
 * 星空レンダラーを管理するカスタムフック
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { INITIAL_ALTITUDE, INITIAL_AZIMUTH, INITIAL_FOV } from "~/constants";
import { getDirectionName } from "~/lib/astronomy";
import type { CameraState } from "~/lib/webgpu/starfield";
import { StarfieldRenderer } from "~/lib/webgpu/starfield";

import { useCameraControls } from "./useCameraControls";

export interface UseStarfieldResult {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	camera: CameraState;
	direction: string;
	altitude: number;
	isLoading: boolean;
	loadingProgress: number;
	error: string | null;
	currentTime: Date;
	setCurrentTime: (time: Date) => void;
}

export function useStarfield(): UseStarfieldResult {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rendererRef = useRef<StarfieldRenderer | null>(null);
	const animationFrameRef = useRef<number>(0);

	const [camera, setCamera] = useState<CameraState>({
		azimuth: INITIAL_AZIMUTH,
		altitude: INITIAL_ALTITUDE,
		fov: INITIAL_FOV,
	});

	const [direction, setDirection] = useState("北");
	const [isLoading, setIsLoading] = useState(true);
	const [loadingProgress, setLoadingProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [currentTime, setCurrentTime] = useState(new Date());

	// カメラ制御フック
	const {
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleWheel,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
	} = useCameraControls({ canvasRef, setCamera });

	// 進捗コールバック
	const handleProgress = useCallback((progress: number) => {
		setLoadingProgress(progress);
	}, []);

	// 初期化
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const renderer = new StarfieldRenderer();
		rendererRef.current = renderer;

		const init = async (): Promise<void> => {
			try {
				await renderer.init(canvas);
				await renderer.loadStarData(handleProgress);
				setIsLoading(false);
			} catch (error_) {
				setError(
					error_ instanceof Error ? error_.message : "初期化に失敗しました",
				);
				setIsLoading(false);
			}
		};

		void init();

		// イベントリスナー登録
		canvas.addEventListener("mousedown", handleMouseDown);
		globalThis.addEventListener("mousemove", handleMouseMove);
		globalThis.addEventListener("mouseup", handleMouseUp);
		canvas.addEventListener("wheel", handleWheel, { passive: false });
		canvas.addEventListener("touchstart", handleTouchStart);
		canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
		canvas.addEventListener("touchend", handleTouchEnd);

		return () => {
			canvas.removeEventListener("mousedown", handleMouseDown);
			globalThis.removeEventListener("mousemove", handleMouseMove);
			globalThis.removeEventListener("mouseup", handleMouseUp);
			canvas.removeEventListener("wheel", handleWheel);
			canvas.removeEventListener("touchstart", handleTouchStart);
			canvas.removeEventListener("touchmove", handleTouchMove);
			canvas.removeEventListener("touchend", handleTouchEnd);
			renderer.dispose();
		};
	}, [
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleWheel,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
		handleProgress,
	]);

	// レンダリングループ
	useEffect(() => {
		const renderer = rendererRef.current;
		if (!renderer || error) return;

		const render = (): void => {
			renderer.render(camera, currentTime);
			setDirection(getDirectionName(camera.azimuth));
			animationFrameRef.current = requestAnimationFrame(render);
		};

		animationFrameRef.current = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animationFrameRef.current);
		};
	}, [camera, currentTime, error]);

	return {
		canvasRef,
		camera,
		direction,
		altitude: (camera.altitude * 180) / Math.PI,
		isLoading,
		loadingProgress,
		error,
		currentTime,
		setCurrentTime,
	};
}
