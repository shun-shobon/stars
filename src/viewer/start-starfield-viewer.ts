import { CATALOG, fetchConstellationLineRecords, streamStarRecords } from "~/catalog/load-catalog";
import type { CameraState } from "~/domain/camera";
import { autoRotateCamera, dragCamera, INITIAL_CAMERA, zoomCamera } from "~/domain/camera";
import { STAR_RECORD_BYTES } from "~/domain/catalog-format";
import { OBSERVER } from "~/domain/observer";
import { localSiderealTime } from "~/domain/sidereal-time";
import type { ViewBasis } from "~/domain/view";
import { computeViewBasis } from "~/domain/view";
import type { StarfieldRenderer } from "~/renderer/starfield-renderer";
import { createStarfieldRenderer } from "~/renderer/starfield-renderer";

import { attachCameraInput } from "./camera-input";
import { trackCanvasResolution } from "./canvas-resolution";

export type ObservationTime = { kind: "realtime" } | { kind: "fixed"; instant: Temporal.Instant };

/** 星カタログの読み込み状況。progress は星のデータの到着率（0〜100） */
export type LoadState = { kind: "loading"; progress: number } | { kind: "ready" };

export type StarfieldViewer = {
	setObservationTime: (time: ObservationTime) => void;
	setConstellationsVisible: (isVisible: boolean) => void;
	/** 毎フレーム、描画に使ったカメラを受け取る。戻り値の関数で購読をやめる */
	subscribeFrame: (listener: (view: ViewBasis) => void) => () => void;
	dispose: () => void;
};

type StartStarfieldViewerOptions = {
	canvas: HTMLCanvasElement;
	onLoadStateChange: (state: LoadState) => void;
	onError: (error: unknown) => void;
};

/**
 * canvas に星空を描き始める。操作していない間は視点を自動で回し、星カタログは読み込みながら描く。
 */
export function startStarfieldViewer({
	canvas,
	onLoadStateChange,
	onError,
}: StartStarfieldViewerOptions): StarfieldViewer {
	const abortController = new AbortController();
	const frameListeners = new Set<(view: ViewBasis) => void>();
	let camera: CameraState = INITIAL_CAMERA;
	let observationTime: ObservationTime = { kind: "realtime" };
	let areConstellationsVisible = true;
	let renderer: StarfieldRenderer | null = null;
	let animationFrameId = 0;

	const resolution = trackCanvasResolution(canvas);
	const cameraInput = attachCameraInput(canvas, {
		onDrag: (dxPx, dyPx) => {
			camera = dragCamera(camera, dxPx, dyPx);
		},
		onZoom: (deltaFov) => {
			camera = zoomCamera(camera, deltaFov);
		},
	});

	const fail = (error: unknown): void => {
		cancelAnimationFrame(animationFrameId);
		onError(error);
	};

	const renderLoop = (activeRenderer: StarfieldRenderer): void => {
		let lastTimestamp = performance.now();

		const renderFrame = (timestamp: number): void => {
			const elapsedSeconds = (timestamp - lastTimestamp) / 1000;
			lastTimestamp = timestamp;
			if (!cameraInput.isInteracting()) {
				camera = autoRotateCamera(camera, elapsedSeconds);
			}

			resolution.apply();
			const instant =
				observationTime.kind === "realtime" ? Temporal.Now.instant() : observationTime.instant;
			const view = computeViewBasis(camera, canvas.width / canvas.height);
			activeRenderer.render({
				view,
				localSiderealTime: localSiderealTime(instant, OBSERVER.longitudeDeg),
				areConstellationsVisible,
			});
			for (const listener of frameListeners) {
				listener(view);
			}

			animationFrameId = requestAnimationFrame(renderFrame);
		};

		animationFrameId = requestAnimationFrame(renderFrame);
	};

	const start = async (): Promise<void> => {
		const createdRenderer = await createStarfieldRenderer(
			canvas,
			{ ...CATALOG, onError: fail },
			abortController.signal,
		);
		if (abortController.signal.aborted) {
			createdRenderer.dispose();
			return;
		}
		renderer = createdRenderer;

		renderLoop(createdRenderer);

		await streamStarRecords((records, byteOffset) => {
			createdRenderer.writeStarRecords(records, byteOffset);
			const loadedBytes = byteOffset + records.byteLength;
			const progress = Math.round((loadedBytes / (CATALOG.starCount * STAR_RECORD_BYTES)) * 100);
			onLoadStateChange({ kind: "loading", progress });
		}, abortController.signal);
		createdRenderer.writeConstellationLineRecords(
			await fetchConstellationLineRecords(abortController.signal),
		);
		onLoadStateChange({ kind: "ready" });
	};

	start().catch((error: unknown) => {
		// dispose で読み込みを中断した結果の失敗は、利用者に見せるものではない
		if (abortController.signal.aborted) {
			return;
		}
		fail(error);
	});

	return {
		setObservationTime: (time) => {
			observationTime = time;
		},
		setConstellationsVisible: (isVisible) => {
			areConstellationsVisible = isVisible;
		},
		subscribeFrame: (listener) => {
			frameListeners.add(listener);
			return () => {
				frameListeners.delete(listener);
			};
		},
		dispose: () => {
			abortController.abort();
			cancelAnimationFrame(animationFrameId);
			cameraInput.detach();
			resolution.disconnect();
			renderer?.dispose();
		},
	};
}
