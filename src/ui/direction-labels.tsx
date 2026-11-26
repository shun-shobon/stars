import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { projectToScreen } from "~/domain/view";
import type { StarfieldViewer } from "~/viewer/start-starfield-viewer";

const DIRECTIONS = [
	{ label: "N", azimuth: 0 },
	{ label: "E", azimuth: Math.PI / 2 },
	{ label: "S", azimuth: Math.PI },
	{ label: "W", azimuth: (Math.PI * 3) / 2 },
] as const;

type DirectionLabelsProps = {
	viewer: StarfieldViewer;
};

/**
 * 地平線上の4方位に N・E・S・W を添える。
 * 位置は毎フレーム変わるため、React の再レンダリングを通さず DOM を直接動かす。
 */
export function DirectionLabels({ viewer }: DirectionLabelsProps): ReactNode {
	const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);

	useEffect(
		() =>
			viewer.subscribeFrame((view) => {
				for (const [index, direction] of DIRECTIONS.entries()) {
					const label = labelRefs.current[index];
					if (label == null) {
						continue;
					}

					const point = projectToScreen(view, direction.azimuth, 0);
					label.hidden = point == null;
					if (point != null) {
						label.style.left = `${point.x * 100}%`;
						label.style.top = `${point.y * 100}%`;
					}
				}
			}),
		[viewer],
	);

	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			{DIRECTIONS.map((direction, index) => (
				<span
					key={direction.label}
					ref={(element) => {
						labelRefs.current[index] = element;
					}}
					hidden
					className="text-celestial-gold absolute -translate-1/2 font-semibold tracking-widest select-none"
				>
					{direction.label}
				</span>
			))}
		</div>
	);
}
