/** 高解像度ディスプレイでも描画コストとメモリが膨らみすぎないよう、物理ピクセル比をここで打ち切る */
const MAX_DEVICE_PIXEL_RATIO = 2;

export type CanvasResolution = {
	/** 前回から変わった表示サイズを canvas の描画解像度に反映する。描画の直前に呼ぶ */
	apply: () => void;
	disconnect: () => void;
};

/**
 * canvas の表示サイズの変化を追う。
 * canvas.width を設定すると描画済みの内容が消え、ResizeObserver は描画ループの後に呼ばれるため、
 * その場で反映するとリサイズ中のフレームが空になる。変化を記録しておき、次の描画の直前に反映する。
 */
export function trackCanvasResolution(canvas: HTMLCanvasElement): CanvasResolution {
	let pendingSize: { width: number; height: number } | null = null;

	const observer = new ResizeObserver(([entry]) => {
		const size = entry?.contentBoxSize[0];
		if (size == null) {
			return;
		}

		const pixelRatio = Math.min(devicePixelRatio, MAX_DEVICE_PIXEL_RATIO);
		pendingSize = {
			width: Math.round(size.inlineSize * pixelRatio),
			height: Math.round(size.blockSize * pixelRatio),
		};
	});
	observer.observe(canvas);

	return {
		apply: () => {
			if (pendingSize == null) {
				return;
			}
			canvas.width = pendingSize.width;
			canvas.height = pendingSize.height;
			pendingSize = null;
		},
		disconnect: () => {
			observer.disconnect();
		},
	};
}
