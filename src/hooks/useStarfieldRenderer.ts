/**
 * 星空レンダラー初期化・レンダリング用カスタムフック
 */

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import {
	cameraAtom,
	currentTimeAtom,
	errorAtom,
	isLoadingAtom,
	loadingProgressAtom,
	rendererAtom,
	showConstellationsAtom,
} from "~/atoms";
import { StarfieldRenderer } from "~/lib/webgpu/starfield";

import { useCameraControls } from "./useCameraControls";

export interface UseStarfieldRendererResult {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/**
 * 星空レンダラーの初期化・レンダリングを管理するフック
 */
export function useStarfieldRenderer(): UseStarfieldRendererResult {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const animationFrameRef = useRef<number>(0);

	// Jotai atoms - renderer state
	const [renderer, setRenderer] = useAtom(rendererAtom);
	const setIsLoading = useSetAtom(isLoadingAtom);
	const setLoadingProgress = useSetAtom(loadingProgressAtom);
	const setError = useSetAtom(errorAtom);
	const error = useAtomValue(errorAtom);

	// Jotai atoms - camera & time
	const camera = useAtomValue(cameraAtom);
	const currentTime = useAtomValue(currentTimeAtom);
	const showConstellations = useAtomValue(showConstellationsAtom);

	// カメラ制御フック
	const {
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleWheel,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
	} = useCameraControls({ canvasRef });

	// 進捗コールバック
	const handleProgress = useCallback(
		(progress: number) => {
			setLoadingProgress(progress);
		},
		[setLoadingProgress],
	);

	// 初期化
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const newRenderer = new StarfieldRenderer();

		const init = async (): Promise<void> => {
			try {
				await newRenderer.init(canvas);
				await newRenderer.loadStarData(handleProgress);
				setRenderer(newRenderer);
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
			newRenderer.dispose();
			setRenderer(null);
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
		setRenderer,
		setIsLoading,
		setError,
	]);

	// 星座線表示の同期
	useEffect(() => {
		renderer?.setConstellationVisibility(showConstellations);
	}, [renderer, showConstellations]);

	// レンダリングループ
	useEffect(() => {
		if (!renderer || error) return;

		const render = (): void => {
			renderer.render(camera, currentTime);
			animationFrameRef.current = requestAnimationFrame(render);
		};

		animationFrameRef.current = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animationFrameRef.current);
		};
	}, [renderer, camera, currentTime, error]);

	return {
		canvasRef,
	};
}
