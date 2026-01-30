/**
 * 星空表示に必要なすべての機能を統合するカスタムフック
 *
 * 内部で以下のフックを使用:
 *
 * - UseStarfieldRenderer: レンダラー初期化・レンダリング
 * - UseRealtimeClock: リアルタイム時刻更新
 */

import { useAtomValue } from "jotai";

import { cameraAtom, showConstellationsAtom } from "~/atoms";
import type { CameraState } from "~/lib/webgpu/types";

import { useRealtimeClock } from "./useRealtimeClock";
import { useStarfieldRenderer } from "./useStarfieldRenderer";

export interface UseStarfieldResult {
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	camera: CameraState;
	showConstellations: boolean;
}

/**
 * 星空表示に必要なすべての状態とセットアップを提供する
 */
export function useStarfield(): UseStarfieldResult {
	// レンダラー初期化・レンダリング
	const { canvasRef } = useStarfieldRenderer();

	// リアルタイム時刻更新
	useRealtimeClock();

	// 状態の購読（表示用）
	const camera = useAtomValue(cameraAtom);
	const showConstellations = useAtomValue(showConstellationsAtom);

	return {
		canvasRef,
		camera,
		showConstellations,
	};
}
