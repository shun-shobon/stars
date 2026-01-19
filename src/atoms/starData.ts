/**
 * 星データ・星座データのatoms
 */

import { atom } from "jotai";

/**
 * 星データのReaderを取得するatom
 * fetchを開始してReaderを返す（ストリーミング用）
 */
export const starDataReaderAtom = atom(async () => {
	const response = await fetch("/stars.bin");

	if (!response.body) {
		throw new Error("ストリーム読み込みがサポートされていません");
	}

	return response.body.getReader();
});

/**
 * 星座データを取得するatom
 */
export const constellationDataAtom = atom(async () => {
	const response = await fetch("/constellations.bin");
	return await response.arrayBuffer();
});
