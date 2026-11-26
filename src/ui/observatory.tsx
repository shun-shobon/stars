import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { LoadState, ObservationTime, StarfieldViewer } from "~/viewer/start-starfield-viewer";
import { startStarfieldViewer } from "~/viewer/start-starfield-viewer";

import { ControlHints } from "./control-hints";
import { describeError } from "./describe-error";
import { DirectionLabels } from "./direction-labels";
import { ErrorPanel } from "./error-panel";
import { LoadingIndicator } from "./loading-indicator";
import { ObservatoryHeader } from "./observatory-header";

/**
 * 星空の canvas と、その上に重ねる操作パネル・方位・読み込み表示。
 */
export function Observatory(): ReactNode {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [viewer, setViewer] = useState<StarfieldViewer | null>(null);
	const [loadState, setLoadState] = useState<LoadState>({ kind: "loading", progress: 0 });
	const [failure, setFailure] = useState<{ error: unknown } | null>(null);
	const [observationTime, setObservationTime] = useState<ObservationTime>({ kind: "realtime" });
	const [areConstellationsVisible, setAreConstellationsVisible] = useState(true);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas == null) {
			throw new Error("Starfield canvas is not mounted.");
		}

		const startedViewer = startStarfieldViewer({
			canvas,
			onLoadStateChange: setLoadState,
			onError: (error) => {
				setFailure({ error });
			},
		});
		setViewer(startedViewer);

		return () => {
			startedViewer.dispose();
			setViewer(null);
		};
	}, []);

	useEffect(() => {
		viewer?.setObservationTime(observationTime);
	}, [viewer, observationTime]);

	useEffect(() => {
		viewer?.setConstellationsVisible(areConstellationsVisible);
	}, [viewer, areConstellationsVisible]);

	if (failure != null) {
		return <ErrorPanel {...describeError(failure.error)} />;
	}

	return (
		<div className="bg-cosmic-void relative h-svh w-svw">
			<canvas
				ref={canvasRef}
				className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
				aria-label="東京から見た星空。ドラッグで視点移動、ホイールやピンチでズーム"
			/>

			{loadState.kind === "loading" && <LoadingIndicator progress={loadState.progress} />}

			<ObservatoryHeader
				observationTime={observationTime}
				onObservationTimeChange={setObservationTime}
				areConstellationsVisible={areConstellationsVisible}
				onConstellationsVisibleChange={setAreConstellationsVisible}
				onError={(error) => {
					setFailure({ error });
				}}
			/>

			{viewer != null && <DirectionLabels viewer={viewer} />}

			<ControlHints />
		</div>
	);
}
