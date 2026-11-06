/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config"

export default getViteConfig({
	resolve: { conditions: ["browser"] },
	test: {
		include: ["tests/**/*.test.ts"],
		// The components render into a DOM in every test, so every file gets one.
		environment: "happy-dom",
		environmentOptions: {
			// Never fetch external scripts (such as gtm.js); report them as loaded instead of erroring.
			happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } },
		},
		setupFiles: ["tests/setup.ts"],
	},
})
