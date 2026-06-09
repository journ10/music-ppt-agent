import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@earendil-works/pi-presentation": resolve(import.meta.dirname, "src/index.ts"),
		},
	},
	test: {
		globals: true,
		environment: "node",
	},
});
