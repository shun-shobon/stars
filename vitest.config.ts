import { defineConfig } from "vitest/config";

// vite.config.ts の Cloudflare プラグインは workerd を起動するため、テストでは読み込まない
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
});
