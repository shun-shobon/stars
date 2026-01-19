/**
 * レンダラー状態のatoms
 */

import { atom } from "jotai";

import { StarfieldRenderer } from "~/lib/webgpu/starfield";

/**
 * レンダラーインスタンス（Promise atom）
 * initDevice()を実行した状態のrendererを返す
 */
export const rendererAtom = atom(async () => {
	const renderer = new StarfieldRenderer();
	await renderer.initDevice();
	return renderer;
});

/**
 * ローディング進捗（0-100）
 */
export const loadingProgressAtom = atom(0);
