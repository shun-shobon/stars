import type { ReactNode } from "react";

type LayerToggleProps = {
	/** 表示を切り替える対象の名前 */
	label: string;
	isOn: boolean;
	onChange: (isOn: boolean) => void;
};

/**
 * 星空に重ねる要素の表示を切り替えるスイッチ。
 */
export function LayerToggle({ label, isOn, onChange }: LayerToggleProps): ReactNode {
	return (
		<button
			type="button"
			onClick={() => {
				onChange(!isOn);
			}}
			className="flex flex-col items-center text-center"
			aria-label={`${label}を表示`}
			aria-pressed={isOn}
		>
			<span className="text-starlight-faint mb-0.5 text-[0.65rem] font-medium tracking-[0.12em] uppercase">
				{label}
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
					className={`hidden text-xs font-light tracking-[0.02em] tabular-nums transition-colors duration-300 sm:inline sm:text-sm ${
						isOn ? "text-celestial-light" : "text-starlight-faint"
					}`}
				>
					{isOn ? "ON" : "OFF"}
				</span>
			</span>
		</button>
	);
}
