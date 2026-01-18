/**
 * UI状態のatoms
 */

import { atom } from "jotai";

/**
 * 日時ピッカーの開閉状態
 */
export const isDatePickerOpenAtom = atom(false);

/**
 * 操作ヒントの表示状態
 */
export const showHintsAtom = atom(true);
