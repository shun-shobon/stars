/**
 * カメラ制御用カスタムフック
 */

import { useCallback, useRef } from "react";

import {
	DRAG_SENSITIVITY,
	MAX_ALTITUDE,
	MAX_FOV,
	MIN_ALTITUDE,
	MIN_FOV,
	ZOOM_SENSITIVITY,
} from "~/constants";
import type { CameraState } from "~/lib/webgpu/starfield";

export interface UseCameraControlsProps {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	setCamera: React.Dispatch<React.SetStateAction<CameraState>>;
}

export interface UseCameraControlsResult {
	handleMouseDown: (e: MouseEvent) => void;
	handleMouseMove: (e: MouseEvent) => void;
	handleMouseUp: () => void;
	handleWheel: (e: WheelEvent) => void;
	handleTouchStart: (e: TouchEvent) => void;
	handleTouchMove: (e: TouchEvent) => void;
	handleTouchEnd: () => void;
}

/**
 * 方位角を 0-2PI に正規化
 */
const normalizeAzimuth = (azimuth: number): number => {
	let normalized = azimuth;
	while (normalized < 0) normalized += Math.PI * 2;
	while (normalized >= Math.PI * 2) normalized -= Math.PI * 2;
	return normalized;
};

/**
 * 高度角を制限
 */
const clampAltitude = (altitude: number): number => {
	return Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, altitude));
};

/**
 * カメラ状態を更新
 */
const updateCameraFromDrag = (
	prev: CameraState,
	dx: number,
	dy: number,
): CameraState => {
	const newAzimuth = normalizeAzimuth(prev.azimuth - dx * DRAG_SENSITIVITY);
	const newAltitude = clampAltitude(prev.altitude + dy * DRAG_SENSITIVITY);

	return {
		...prev,
		azimuth: newAzimuth,
		altitude: newAltitude,
	};
};

export function useCameraControls({
	canvasRef,
	setCamera,
}: UseCameraControlsProps): UseCameraControlsResult {
	const isDraggingRef = useRef(false);
	const lastMouseRef = useRef({ x: 0, y: 0 });
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

			setCamera((prev) => updateCameraFromDrag(prev, dx, dy));
		},
		[canvasRef, setCamera],
	);

	const handleMouseUp = useCallback(() => {
		isDraggingRef.current = false;
	}, []);

	// ホイールでズーム
	const handleWheel = useCallback(
		(e: WheelEvent) => {
			e.preventDefault();
			setCamera((prev) => {
				let newFov = prev.fov + e.deltaY * ZOOM_SENSITIVITY;
				newFov = Math.max(MIN_FOV, Math.min(MAX_FOV, newFov));
				return { ...prev, fov: newFov };
			});
		},
		[setCamera],
	);

	// タッチイベントハンドラー
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

			setCamera((prev) => updateCameraFromDrag(prev, dx, dy));
		},
		[setCamera],
	);

	const handleTouchEnd = useCallback(() => {
		isDraggingRef.current = false;
		touchStartRef.current = null;
	}, []);

	return {
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleWheel,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
	};
}
