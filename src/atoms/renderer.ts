/**
 * レンダラー状態のatoms
 */

import { atom } from "jotai";

import type { StarfieldRenderer } from "~/lib/webgpu/starfield";

/**
 * レンダラーインスタンス
 */
export const rendererAtom = atom<StarfieldRenderer | null>(null);

/**
 * ローディング中かどうか
 */
export const isLoadingAtom = atom(true);

/**
 * ローディング進捗（0-100）
 */
export const loadingProgressAtom = atom(0);

/**
 * エラーメッセージ
 */
export const errorAtom = atom<string | null>(null);
