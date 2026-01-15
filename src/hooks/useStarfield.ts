/**
 * 星空レンダラーを管理するカスタムフック
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { CameraState } from "~/lib/webgpu/starfield";
import { StarfieldRenderer } from "~/lib/webgpu/starfield";

export interface UseStarfieldResult {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	camera: CameraState;
	direction: string;
	altitude: number;
	isLoading: boolean;
	error: string | null;
	currentTime: Date;
	setCurrentTime: (time: Date) => void;
}

export function useStarfield(): UseStarfieldResult {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const rendererRef = useRef<StarfieldRenderer | null>(null);
	const animationFrameRef = useRef<number>(0);

	const [camera, setCamera] = useState<CameraState>({
		azimuth: 0, // 北向き
		altitude: Math.PI / 4, // 45度上向き
		fov: Math.PI / 2, // 90度視野
	});

	const [direction, setDirection] = useState("北");
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentTime, setCurrentTime] = useState(new Date());

	// ドラッグ操作用の状態
	const isDraggingRef = useRef(false);
	const lastMouseRef = useRef({ x: 0, y: 0 });

	// マウスイベントハンドラー
	const handleMouseDown = useCallback((e: MouseEvent) => {
		isDraggingRef.current = true;
		lastMouseRef.current = { x: e.clientX, y: e.clientY };
	}, []);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isDraggingRef.current || !canvasRef.current) return;

			const dx = e.clientX - lastMouseRef.current.x;
			const dy = e.clientY - lastMouseRef.current.y;
			lastMouseRef.current = { x: e.clientX, y: e.clientY };

			const sensitivity = 0.005;

			setCamera((prev) => {
				let newAzimuth = prev.azimuth - dx * sensitivity;
				let newAltitude = prev.altitude + dy * sensitivity;

				// 方位角を 0-2PI に正規化
				while (newAzimuth < 0) newAzimuth += Math.PI * 2;
				while (newAzimuth >= Math.PI * 2) newAzimuth -= Math.PI * 2;

				// 高度角を制限 (-PI/2 から PI/2)
				newAltitude = Math.max(
					-Math.PI / 2 + 0.1,
					Math.min(Math.PI / 2 - 0.1, newAltitude),
				);

				return {
					...prev,
					azimuth: newAzimuth,
					altitude: newAltitude,
				};
			});
		},
		[setCamera],
	);

	const handleMouseUp = useCallback(() => {
		isDraggingRef.current = false;
	}, []);

	// ホイールでズーム
	const handleWheel = useCallback(
		(e: WheelEvent) => {
			e.preventDefault();
			setCamera((prev) => {
				const zoomSensitivity = 0.001;
				let newFov = prev.fov + e.deltaY * zoomSensitivity;
				// 視野角を制限
				newFov = Math.max(Math.PI / 6, Math.min(Math.PI, newFov));
				return { ...prev, fov: newFov };
			});
		},
		[setCamera],
	);

	// タッチイベント対応
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);

	const handleTouchStart = useCallback((e: TouchEvent) => {
		if (e.touches.length === 1) {
			const touch = e.touches[0];
			if (touch) {
				isDraggingRef.current = true;
				touchStartRef.current = { x: touch.clientX, y: touch.clientY };
				lastMouseRef.current = { x: touch.clientX, y: touch.clientY };
			}
		}
	}, []);

	const handleTouchMove = useCallback(
		(e: TouchEvent) => {
			if (!isDraggingRef.current || e.touches.length !== 1) return;
			e.preventDefault();

			const touch = e.touches[0];
			if (!touch) return;

			const dx = touch.clientX - lastMouseRef.current.x;
			const dy = touch.clientY - lastMouseRef.current.y;
			lastMouseRef.current = { x: touch.clientX, y: touch.clientY };

			const sensitivity = 0.005;

			setCamera((prev) => {
				let newAzimuth = prev.azimuth - dx * sensitivity;
				let newAltitude = prev.altitude + dy * sensitivity;

				while (newAzimuth < 0) newAzimuth += Math.PI * 2;
				while (newAzimuth >= Math.PI * 2) newAzimuth -= Math.PI * 2;

				newAltitude = Math.max(
					-Math.PI / 2 + 0.1,
					Math.min(Math.PI / 2 - 0.1, newAltitude),
				);

				return {
					...prev,
					azimuth: newAzimuth,
					altitude: newAltitude,
				};
			});
		},
		[setCamera],
	);

	const handleTouchEnd = useCallback(() => {
		isDraggingRef.current = false;
		touchStartRef.current = null;
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
				await renderer.loadStarData();
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
	]);

	// レンダリングループ
	useEffect(() => {
		const renderer = rendererRef.current;
		if (!renderer || isLoading || error) return;

		const render = (): void => {
			renderer.render(camera, currentTime);
			setDirection(renderer.getDirectionName(camera.azimuth));
			animationFrameRef.current = requestAnimationFrame(render);
		};

		animationFrameRef.current = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animationFrameRef.current);
		};
	}, [camera, currentTime, isLoading, error]);

	return {
		canvasRef,
		camera,
		direction,
		altitude: (camera.altitude * 180) / Math.PI,
		isLoading,
		error,
		currentTime,
		setCurrentTime,
	};
}
