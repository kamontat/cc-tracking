import { execFileSync } from "node:child_process"
import svelte from "@astrojs/svelte"
import { defineConfig } from "astro/config"

import { type BuildEnv, resolveBuildEnv } from "./scripts/build-env"

/** What `git <args>` prints, or `""` in a tree without git (a source tarball, a sandbox). */
const git = (...args: string[]): string => {
	try {
		return execFileSync("git", args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		})
	} catch {
		return ""
	}
}

// The commit and build time Settings > About shows. Vite inlines every `PUBLIC_*` variable it
// finds in the environment, so the stamps go there before it starts.
Object.assign(
	process.env,
	resolveBuildEnv({
		sha: git("rev-parse", "HEAD"),
		branch: git("rev-parse", "--abbrev-ref", "HEAD"),
		now: new Date(),
		env: process.env as Partial<BuildEnv>,
	}),
)

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
	output: "static",
	// "file" writes about.astro to dist/about.html, served at /about by Cloudflare static assets.
	build: { format: "file" },
	trailingSlash: "never",
	// Fetch a page as its link comes into view (the tab bar on every page), so a tap swaps in HTML
	// already in hand. On a phone there is no hover to wait for.
	prefetch: { prefetchAll: true, defaultStrategy: "viewport" },
	// Svelte renders the islands: the parts of a page built from the reader's data (PRD DD-172).
	integrations: [svelte()],
})
