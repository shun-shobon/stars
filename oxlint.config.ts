import { shun_shobon } from "@shun-shobon/oxlint-config";
import type { OxlintOverride } from "oxlint";

const UI_PACKAGES = ["react", "react-dom", "react-dom/*"];

const restrict = (files: string, forbidden: string[]): OxlintOverride => ({
	files: [files],
	rules: {
		"no-restricted-imports": [
			"error",
			{
				patterns: [
					{
						group: forbidden,
						message:
							"レイヤーの依存方向に反します。AGENTS.md の「ディレクトリ構成」を参照してください",
					},
					{
						group: ["../*"],
						message:
							"レイヤーをまたぐ import は ~/ から書きます。AGENTS.md の「ディレクトリ構成」を参照してください",
					},
				],
			},
		],
	},
});

export default shun_shobon(
	{ ignores: ["worker/worker-configuration.d.ts"] },
	{
		overrides: [
			restrict("src/domain/**", [
				"~/catalog/*",
				"~/renderer/*",
				"~/viewer/*",
				"~/ui/*",
				...UI_PACKAGES,
			]),
			restrict("src/catalog/**", ["~/renderer/*", "~/viewer/*", "~/ui/*", ...UI_PACKAGES]),
			restrict("src/renderer/**", ["~/catalog/*", "~/viewer/*", "~/ui/*", ...UI_PACKAGES]),
			restrict("src/viewer/**", ["~/ui/*", ...UI_PACKAGES]),
			restrict("src/ui/**", []),
		],
	},
);
