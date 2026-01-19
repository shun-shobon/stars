/**
 * 星データ・星座データのatoms
 */

import { atom } from "jotai";

import { BYTES_PER_STAR } from "~/constants";
import starsMeta from "~/data/stars-meta.json";
import { store } from "~/lib/store";

import { loadingProgressAtom } from "./renderer";

/**
 * 星データを取得するatom（Progress更新付き）
 */
export const starDataAtom = atom(async () => {
	const totalBytes = starsMeta.starCount * BYTES_PER_STAR;
	const response = await fetch("/stars.bin");

	if (!response.body) {
		throw new Error("ストリーム読み込みがサポートされていません");
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		chunks.push(value);
		receivedBytes += value.length;

		// 進捗を更新
		const progress = Math.round((receivedBytes / totalBytes) * 100);
		store.set(loadingProgressAtom, progress);
	}

	// チャンクを結合してArrayBufferを返す
	const buffer = new Uint8Array(receivedBytes);
	let offset = 0;
	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.length;
	}

	// 完了時は100%
	store.set(loadingProgressAtom, 100);

	return buffer.buffer;
});

/**
 * 星座データを取得するatom
 */
export const constellationDataAtom = atom(async () => {
	const response = await fetch("/constellations.bin");
	return await response.arrayBuffer();
});
