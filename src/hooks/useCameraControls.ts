/**
 * カメラ制御用カスタムフック
 */

import { useSetAtom } from "jotai";
import { useCallback, useRef } from "react";

import { cameraAtom } from "~/atoms";
import {
	DRAG_SENSITIVITY,
	MAX_ALTITUDE,
	MAX_FOV,
	MIN_ALTITUDE,
	MIN_FOV,
	PINCH_ZOOM_SENSITIVITY,
	ZOOM_SENSITIVITY,
} from "~/constants";
import type { CameraState } from "~/lib/webgpu/types";

export interface UseCameraControlsProps {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export interface UseCameraControlsResult {
	handleMouseDown: (e: MouseEvent) => void;
	handleMouseMove: (e: MouseEvent) => void;
	handleMouseUp: () => void;
	handleWheel: (e: WheelEvent) => void;
	handleTouchStart: (e: TouchEvent) => void;
	handleTouchMove: (e: TouchEvent) => void;
	handleTouchEnd: (e: TouchEvent) => void;
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
 * 2点間の距離を計算
 */
const getTouchDistance = (touch1: Touch, touch2: Touch): number => {
	const dx = touch1.clientX - touch2.clientX;
	const dy = touch1.clientY - touch2.clientY;
	return Math.hypot(dx, dy);
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
}: UseCameraControlsProps): UseCameraControlsResult {
	const setCamera = useSetAtom(cameraAtom);

	const isDraggingRef = useRef(false);
	const lastMouseRef = useRef({ x: 0, y: 0 });
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const isPinchingRef = useRef(false);
	const lastPinchDistanceRef = useRef(0);

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
			// 1本指: ドラッグ操作
			const touch = e.touches[0];
			if (touch) {
				isDraggingRef.current = true;
				isPinchingRef.current = false;
				touchStartRef.current = { x: touch.clientX, y: touch.clientY };
				lastMouseRef.current = { x: touch.clientX, y: touch.clientY };
			}
		} else if (e.touches.length === 2) {
			// 2本指: ピンチ操作
			const touch1 = e.touches[0];
			const touch2 = e.touches[1];
			if (touch1 && touch2) {
				isDraggingRef.current = false;
				isPinchingRef.current = true;
				lastPinchDistanceRef.current = getTouchDistance(touch1, touch2);
			}
		}
	}, []);

	const handleTouchMove = useCallback(
		(e: TouchEvent) => {
			e.preventDefault();

			if (e.touches.length === 2 && isPinchingRef.current) {
				// 2本指: ピンチズーム
				const touch1 = e.touches[0];
				const touch2 = e.touches[1];
				if (!touch1 || !touch2) return;

				const currentDistance = getTouchDistance(touch1, touch2);
				const deltaDistance = currentDistance - lastPinchDistanceRef.current;
				lastPinchDistanceRef.current = currentDistance;

				// ピンチイン（指を近づける）で拡大、ピンチアウト（指を離す）で縮小
				setCamera((prev) => {
					let newFov = prev.fov - deltaDistance * PINCH_ZOOM_SENSITIVITY;
					newFov = Math.max(MIN_FOV, Math.min(MAX_FOV, newFov));
					return { ...prev, fov: newFov };
				});
			} else if (e.touches.length === 1 && isDraggingRef.current) {
				// 1本指: ドラッグ
				const touch = e.touches[0];
				if (!touch) return;

				const dx = touch.clientX - lastMouseRef.current.x;
				const dy = touch.clientY - lastMouseRef.current.y;
				lastMouseRef.current = { x: touch.clientX, y: touch.clientY };

				setCamera((prev) => updateCameraFromDrag(prev, dx, dy));
			}
		},
		[setCamera],
	);

	const handleTouchEnd = useCallback((e: TouchEvent) => {
		if (e.touches.length === 0) {
			// すべての指が離れた
			isDraggingRef.current = false;
			isPinchingRef.current = false;
			touchStartRef.current = null;
			lastPinchDistanceRef.current = 0;
		} else if (e.touches.length === 1) {
			// 2本指から1本指に変わった場合、ドラッグモードに切り替え
			const touch = e.touches[0];
			if (touch) {
				isDraggingRef.current = true;
				isPinchingRef.current = false;
				lastMouseRef.current = { x: touch.clientX, y: touch.clientY };
			}
		}
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
