/**
 * リアルタイム時刻更新用カスタムフック
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

import { currentTimeAtom, isRealtimeModeAtom } from "~/atoms";

/**
 * リアルタイムモード時に1秒ごとに現在時刻を更新する
 */
export function useRealtimeClock(): void {
	const isRealtimeMode = useAtomValue(isRealtimeModeAtom);
	const setCurrentTime = useSetAtom(currentTimeAtom);

	useEffect(() => {
		if (!isRealtimeMode) return;

		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	}, [isRealtimeMode, setCurrentTime]);
}
