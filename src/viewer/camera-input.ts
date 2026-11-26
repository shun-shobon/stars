/** ホイール1単位あたりの視野角の変化（ラジアン） */
const WHEEL_FOV_PER_DELTA = 0.001;

/** ピンチで指の間隔が1ピクセル広がるごとの視野角の変化（ラジアン）。指を広げると拡大する */
const PINCH_FOV_PER_PIXEL = -0.005;

type Point = { x: number; y: number };

export type CameraInputHandlers = {
	onDrag: (dxPx: number, dyPx: number) => void;
	onZoom: (deltaFov: number) => void;
};

export type CameraInput = {
	/** ドラッグやピンチで指やボタンを押している間 true */
	isInteracting: () => boolean;
	detach: () => void;
};

/**
 * canvas へのマウス・タッチ・ペンの操作を、視点のドラッグと視野角のズームに変換する。
 * 1本の指（またはボタン）でドラッグ、2本の指でピンチ、ホイールでズームする。
 */
export function attachCameraInput(
	canvas: HTMLCanvasElement,
	handlers: CameraInputHandlers,
): CameraInput {
	const pointers = new Map<number, Point>();
	let lastPinchDistance = 0;

	const onPointerDown = (event: PointerEvent): void => {
		// 右クリックなどはコンテキストメニューに pointerup を奪われ、押したままの扱いが残ることがある
		if (event.button !== 0) {
			return;
		}
		canvas.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		lastPinchDistance = pinchDistance(pointers);
	};

	const onPointerMove = (event: PointerEvent): void => {
		const previous = pointers.get(event.pointerId);
		if (previous == null) {
			return;
		}
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (pointers.size === 1) {
			handlers.onDrag(event.clientX - previous.x, event.clientY - previous.y);
			return;
		}

		const distance = pinchDistance(pointers);
		handlers.onZoom((distance - lastPinchDistance) * PINCH_FOV_PER_PIXEL);
		lastPinchDistance = distance;
	};

	const onPointerEnd = (event: PointerEvent): void => {
		pointers.delete(event.pointerId);
		lastPinchDistance = pinchDistance(pointers);
	};

	const onWheel = (event: WheelEvent): void => {
		// ページのスクロールや拡大をさせない
		event.preventDefault();
		handlers.onZoom(event.deltaY * WHEEL_FOV_PER_DELTA);
	};

	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerup", onPointerEnd);
	canvas.addEventListener("pointercancel", onPointerEnd);
	canvas.addEventListener("lostpointercapture", onPointerEnd);
	canvas.addEventListener("wheel", onWheel, { passive: false });

	return {
		isInteracting: () => pointers.size > 0,
		detach: () => {
			canvas.removeEventListener("pointerdown", onPointerDown);
			canvas.removeEventListener("pointermove", onPointerMove);
			canvas.removeEventListener("pointerup", onPointerEnd);
			canvas.removeEventListener("pointercancel", onPointerEnd);
			canvas.removeEventListener("lostpointercapture", onPointerEnd);
			canvas.removeEventListener("wheel", onWheel);
		},
	};
}

/** 3本目以降の指は無視し、最初の2本の間隔を返す。2本そろっていなければ 0 */
function pinchDistance(pointers: Map<number, Point>): number {
	const [first, second] = pointers.values();
	if (first == null || second == null) {
		return 0;
	}
	return Math.hypot(first.x - second.x, first.y - second.y);
}
