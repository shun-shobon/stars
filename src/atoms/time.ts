/**
 * 時刻状態のatoms
 */

import { atom } from "jotai";

/**
 * 現在時刻
 */
export const currentTimeAtom = atom(new Date());

/**
 * リアルタイムモードかどうか
 */
export const isRealtimeModeAtom = atom(true);
