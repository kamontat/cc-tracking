import { resolve } from "node:path";
import type { BunPlugin } from "bun";

/** Where the pages live; a page's path under it is its address. */
export const ROUTES = resolve(import.meta.dir, "../src/routes");

/**
 * Roots the production bundle at `src/routes`. `bun-server build` passes no `root`, so Bun
 * infers one, and Bun 1.4 infers the working directory once there are nine HTML pages: every
 * page then lands under `dist/src/routes/` and no address works. Pinning the root keeps
 * `src/routes/list/new.html` at `dist/list/new.html`. Loaded through bunfig.toml's
 * `[serve.static] plugins`, the one hook `bun-server build` offers; `scripts/build.ts` checks
 * the output in case it ever fails to load.
 */
const routesRoot: BunPlugin = {
	name: "routes-root",
	setup(build) {
		build.config.root ??= ROUTES;
	},
};

export default routesRoot;
