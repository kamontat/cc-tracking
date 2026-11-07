import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"

/** Files in `dist/` the worker never caches: Cloudflare's rules, and the worker itself. */
const SKIP = new Set(["_headers", "_redirects", "sw.js"])

/**
 * The address each build file is served at, which is what the worker caches. Cloudflare serves
 * `card/edit.html` at `/card/edit` and `index.html` at `/` (`build.format: "file"`); asking for
 * the `.html` address gets a redirect, which a cache cannot answer a page with.
 */
export function precacheUrls(paths: readonly string[]): string[] {
	return paths
		.filter((path) => !SKIP.has(path))
		.map((path) => {
			if (path === "index.html") return "/"
			if (path.endsWith(".html")) return `/${path.slice(0, -".html".length)}`
			return `/${path}`
		})
}

/** A short hash of every file's path and content: the same build gives the same version. */
export function cacheVersion(files: readonly { path: string; content: string | Uint8Array }[]): string {
	const hash = createHash("sha256")
	for (const { path, content } of files.toSorted((a, b) => a.path.localeCompare(b.path))) {
		hash.update(path).update("\0").update(content).update("\0")
	}
	return hash.digest("hex").slice(0, 16)
}

/**
 * Bundles `src/lib/offline/sw.ts` into `<dist>/sw.js`, defining the build's version and the
 * addresses of its files (PRD DD-181). The `astro:build:done` hook in `astro.config.ts` runs it.
 */
export async function writeServiceWorker(dist: string): Promise<{ version: string; urls: string[] }> {
	const entries = await readdir(dist, { recursive: true, withFileTypes: true })
	const paths = entries
		.filter((entry) => entry.isFile())
		.map((entry) => relative(dist, join(entry.parentPath, entry.name)).split(sep).join("/"))
		.filter((path) => !SKIP.has(path))
		.toSorted()
	const files = await Promise.all(paths.map(async (path) => ({ path, content: await readFile(join(dist, path)) })))
	const version = cacheVersion(files)
	const urls = precacheUrls(paths)
	const result = await Bun.build({
		entrypoints: [join(import.meta.dirname, "../src/lib/offline/sw.ts")],
		target: "browser",
		minify: true,
		define: { __CC_VERSION__: JSON.stringify(version), __CC_URLS__: JSON.stringify(urls) },
	})
	const [output] = result.outputs
	if (!result.success || !output) throw new AggregateError(result.logs, "Could not bundle the service worker")
	await writeFile(join(dist, "sw.js"), await output.text())
	return { version, urls }
}
