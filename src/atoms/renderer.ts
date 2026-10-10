/**
 * レンダラー状態のatoms
 */

import { atom } from "jotai";

import { starDataReaderAtom } from "~/atoms/starData";
import { store } from "~/lib/store";
import { StarfieldRenderer } from "~/lib/webgpu/starfield";

/**
 * レンダラーインスタンス（Promise atom） initDevice()を実行した状態のrendererを返す
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

let starDataLoadPromise: Promise<void> | null = null;
let hasStarDataLoaded = false;

/**
 * 星データ読み込み完了フラグ onMountでストリーミング読み込みを開始する
 */
export const starDataReadyAtom = atom(false);

starDataReadyAtom.onMount = (set) => {
	if (hasStarDataLoaded) {
		set(true);
		store.set(loadingProgressAtom, 100);
		return;
	}

	if (starDataLoadPromise) {
		return;
	}

	starDataLoadPromise = (async () => {
		store.set(loadingProgressAtom, 0);
		const renderer = await store.get(rendererAtom);
		const reader = await store.get(starDataReaderAtom);

		await renderer.loadStarDataFromReader(reader, (progress) => {
			store.set(loadingProgressAtom, progress);
		});

		hasStarDataLoaded = true;
		set(true);
	})()
		.catch((error) => {
			console.error("星データの読み込みに失敗しました:", error);
		})
		.finally(() => {
			starDataLoadPromise = null;
		});
};
