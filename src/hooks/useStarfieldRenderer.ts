/**
 * 星空レンダラー初期化・レンダリング用カスタムフック
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

import {
	cameraAtom,
	constellationDataAtom,
	currentTimeAtom,
	loadingProgressAtom,
	rendererAtom,
	showConstellationsAtom,
	starDataReaderAtom,
} from "~/atoms";
import { AUTO_ROTATE_SPEED } from "~/constants";
import { store } from "~/lib/store";

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
	const isAttachedRef = useRef(false);
	const isLoadingRef = useRef(false);

	// useAtomValueでPromise atomからデータ取得（Suspenseでawait）
	const renderer = useAtomValue(rendererAtom);
	const starDataReader = useAtomValue(starDataReaderAtom);
	const constellationData = useAtomValue(constellationDataAtom);

	// Jotai atoms
	const setCamera = useSetAtom(cameraAtom);
	const setLoadingProgress = useSetAtom(loadingProgressAtom);
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
		isInteractingRef,
	} = useCameraControls({ canvasRef });

	// canvas接続とデータセットアップ
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		// canvas接続（sync）
		renderer.attachCanvas(canvas);
		isAttachedRef.current = true;

		// 星データバッファを初期化（sync、既存の場合はスキップ）
		renderer.initStarBuffer();

		// 星座データをGPUバッファに転送（sync、既存の場合はスキップ）
		renderer.setConstellationData(constellationData);

		// 星データのストリーミング読み込みを開始（async、バックグラウンドで実行）
		if (!isLoadingRef.current) {
			isLoadingRef.current = true;
			void renderer.loadStarDataFromReader(starDataReader, (progress) => {
				setLoadingProgress(progress);
			});
		}

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
			// StrictMode対応: disposeではなくdetachCanvasを使用
			// リソースは破棄せずcanvas参照のみクリア
			renderer.detachCanvas();
			isAttachedRef.current = false;
		};
	}, [
		renderer,
		starDataReader,
		constellationData,
		setLoadingProgress,
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleWheel,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
	]);

	// 星座線表示の同期
	useEffect(() => {
		renderer.setConstellationVisibility(showConstellations);
	}, [renderer, showConstellations]);

	// レンダリングループ
	useEffect(() => {
		if (!isAttachedRef.current) return;

		let lastTime = performance.now();

		const render = (): void => {
			const now = performance.now();
			const deltaTime = (now - lastTime) / 1000; // 秒に変換
			lastTime = now;

			// 操作していないときは自動回転
			if (!isInteractingRef.current) {
				setCamera((prev) => {
					let newAzimuth = prev.azimuth + AUTO_ROTATE_SPEED * deltaTime;
					// 0-2π に正規化
					while (newAzimuth >= Math.PI * 2) newAzimuth -= Math.PI * 2;
					return { ...prev, azimuth: newAzimuth };
				});
			}

			const camera = store.get(cameraAtom);
			const currentTime = store.get(currentTimeAtom);

			renderer.render(camera, currentTime);
			animationFrameRef.current = requestAnimationFrame(render);
		};

		animationFrameRef.current = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animationFrameRef.current);
		};
	}, [renderer, isInteractingRef, setCamera]);

	return {
		canvasRef,
	};
}
