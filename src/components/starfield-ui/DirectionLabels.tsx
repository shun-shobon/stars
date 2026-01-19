/**
 * 方角ラベルコンポーネント 天球の水平線上に4方位（N, E, S, W）を表示
 */

import type { FC } from "react";

import { projectToScreen } from "~/lib/projection";

export interface DirectionLabelsProps {
	/**
	 * カメラの方位角（ラジアン）
	 */
	azimuth: number;
	/**
	 * カメラの仰角（ラジアン）
	 */
	altitude: number;
	/**
	 * 視野角（ラジアン）
	 */
	fov: number;
	/**
	 * キャンバスのアスペクト比
	 */
	aspect: number;
}

/**
 * 4方位の定義
 */
const DIRECTIONS = [
	{ label: "N", azimuth: 0 },
	{ label: "E", azimuth: Math.PI / 2 },
	{ label: "S", azimuth: Math.PI },
	{ label: "W", azimuth: (3 * Math.PI) / 2 },
] as const;

export const DirectionLabels: FC<DirectionLabelsProps> = ({
	azimuth,
	altitude,
	fov,
	aspect,
}) => {
	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			{DIRECTIONS.map((dir) => {
				const screen = projectToScreen(dir.azimuth, 0, {
					azimuth,
					altitude,
					fov,
					aspect,
				});

				if (!screen.visible) {
					return null;
				}

				return (
					<span
						key={dir.label}
						className="text-celestial-gold absolute font-semibold tracking-widest select-none"
						style={{
							left: `${(screen.x * 100).toString()}%`,
							top: `${(screen.y * 100).toString()}%`,
							transform: "translate(-50%, -50%)",
						}}
					>
						{dir.label}
					</span>
				);
			})}
		</div>
	);
};
