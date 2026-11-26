import type { ReactNode } from "react";

type ConstellationToggleProps = {
	isOn: boolean;
	onChange: (isOn: boolean) => void;
};

export function ConstellationToggle({ isOn, onChange }: ConstellationToggleProps): ReactNode {
	return (
		<button
			type="button"
			onClick={() => {
				onChange(!isOn);
			}}
			className="flex flex-col items-center text-center"
			aria-label="星座線を表示"
			aria-pressed={isOn}
		>
			<span className="text-starlight-faint mb-0.5 text-[0.65rem] font-medium tracking-[0.12em] uppercase">
				星座線
			</span>
			<span className="flex items-center gap-1.5">
				<span
					className={`relative h-4 w-8 rounded-full border transition-all duration-300 ${
						isOn
							? "border-celestial-gold bg-celestial-gold/30"
							: "border-starlight-faint/40 bg-cosmic-night"
					}`}
				>
					<span
						className={`absolute top-0.5 size-2.5 rounded-full transition-all duration-300 ${
							isOn
								? "bg-celestial-gold left-[18px] shadow-[0_0_6px_rgb(212_165_116/0.6)]"
								: "bg-starlight-faint left-0.5"
						}`}
					/>
				</span>
				<span
					className={`text-xs font-light tracking-[0.02em] tabular-nums transition-colors duration-300 sm:text-sm ${
						isOn ? "text-celestial-light" : "text-starlight-faint"
					}`}
				>
					{isOn ? "ON" : "OFF"}
				</span>
			</span>
		</button>
	);
}
