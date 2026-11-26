import type { ReactNode } from "react";

const CORNER_CLASS_NAMES = [
	"top-1.5 left-1.5",
	"top-1.5 right-1.5 rotate-90",
	"bottom-1.5 left-1.5 -rotate-90",
	"right-1.5 bottom-1.5 rotate-180",
] as const;

/**
 * パネルの四隅に置く金色の鉤形の飾り。
 */
export function CornerOrnaments(): ReactNode {
	return CORNER_CLASS_NAMES.map((className) => (
		<svg
			key={className}
			className={`absolute size-3 ${className}`}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1"
			aria-hidden="true"
		>
			<path d="M1 1 L1 8 M1 1 L8 1" className="text-celestial-gold/40" />
		</svg>
	));
}
