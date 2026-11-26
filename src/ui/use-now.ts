import { useEffect, useState } from "react";

/**
 * 現在時刻を1秒ごとに更新して返す。
 */
export function useNow(): Temporal.Instant {
	const [now, setNow] = useState(() => Temporal.Now.instant());

	useEffect(() => {
		const intervalId = setInterval(() => {
			setNow(Temporal.Now.instant());
		}, 1000);

		return () => {
			clearInterval(intervalId);
		};
	}, []);

	return now;
}
