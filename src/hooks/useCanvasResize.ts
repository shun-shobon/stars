/**
 * キャンバスリサイズ用カスタムフック
 */

import { useCallback, useEffect } from "react";

export interface UseCanvasResizeProps {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useCanvasResize({ canvasRef }: UseCanvasResizeProps): void {
	const updateSize = useCallback((): void => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const dpr = window.devicePixelRatio;
		canvas.width = window.innerWidth * dpr;
		canvas.height = window.innerHeight * dpr;
		canvas.style.width = `${window.innerWidth.toString()}px`;
		canvas.style.height = `${window.innerHeight.toString()}px`;
	}, [canvasRef]);

	useEffect(() => {
		updateSize();
		window.addEventListener("resize", updateSize);
		return () => {
			window.removeEventListener("resize", updateSize);
		};
	}, [updateSize]);
}
