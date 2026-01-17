/**
 * 装飾コーナーコンポーネント
 */

import type { FC } from "react";

export interface CornerOrnamentProps {
	position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const positionClasses: Record<CornerOrnamentProps["position"], string> = {
	"top-left": "top-1.5 left-1.5",
	"top-right": "top-1.5 right-1.5 rotate-90",
	"bottom-left": "bottom-1.5 left-1.5 -rotate-90",
	"bottom-right": "bottom-1.5 right-1.5 rotate-180",
};

export const CornerOrnament: FC<CornerOrnamentProps> = ({ position }) => {
	return (
		<svg
			className={`absolute h-3 w-3 ${positionClasses[position]}`}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1"
			aria-hidden="true"
		>
			<path d="M1 1 L1 8 M1 1 L8 1" className="text-celestial-gold/40" />
		</svg>
	);
};
