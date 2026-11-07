import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"

import { cacheVersion, precacheUrls, writeServiceWorker } from "../../scripts/service-worker"

let dist = ""

afterEach(async () => {
	if (dist) await rm(dist, { recursive: true, force: true })
	dist = ""
})

const writeDist = async (files: Record<string, string>) => {
	dist = await mkdtemp(join(tmpdir(), "cc-sw-"))
	for (const [path, content] of Object.entries(files)) {
		await mkdir(join(dist, path, ".."), { recursive: true })
		await writeFile(join(dist, path), content)
	}
	return dist
}

test("a page is cached at the address Cloudflare serves it from, without .html", () => {
	expect(precacheUrls(["index.html", "card.html", "card/edit.html", "settings/locations.html"])).toEqual([
		"/",
		"/card",
		"/card/edit",
		"/settings/locations",
	])
})

test("every other file is cached at its own path", () => {
	expect(precacheUrls(["_astro/page.CjqvKrOs.js", "_astro/card.D6PV1xJZ.css", "favicon.svg"])).toEqual([
		"/_astro/page.CjqvKrOs.js",
		"/_astro/card.D6PV1xJZ.css",
		"/favicon.svg",
	])
})

test("the Cloudflare rules and the service worker itself are not cached", () => {
	expect(precacheUrls(["_headers", "_redirects", "sw.js", "index.html"])).toEqual(["/"])
})

test("the version follows the files' content, so any change to the site is a new version", () => {
	const one = cacheVersion([{ path: "index.html", content: "a" }])
	expect(one).toMatch(/^[0-9a-f]{16}$/)
	expect(cacheVersion([{ path: "index.html", content: "a" }])).toBe(one)
	expect(cacheVersion([{ path: "index.html", content: "b" }])).not.toBe(one)
	expect(cacheVersion([{ path: "home.html", content: "a" }])).not.toBe(one)
})

test("writes dist/sw.js carrying the build's files and their version", async () => {
	await writeDist({
		"index.html": "<h1>home</h1>",
		"card/edit.html": "<h1>edit</h1>",
		"_astro/page.abc.js": "console.log(1)",
		_headers: "",
	})
	const { version, urls } = await writeServiceWorker(dist)
	expect(urls.toSorted()).toEqual(["/", "/_astro/page.abc.js", "/card/edit"])
	const script = await Bun.file(join(dist, "sw.js")).text()
	expect(script).toContain(JSON.stringify(version))
	for (const url of urls) expect(script).toContain(JSON.stringify(url))
	expect(script).toContain("addEventListener")
	expect(script).not.toMatch(/^\s*(import|export)\b/m)
})

test("a rebuild of the same files keeps the version; a changed file moves it", async () => {
	await writeDist({ "index.html": "<h1>home</h1>" })
	const first = await writeServiceWorker(dist)
	expect((await writeServiceWorker(dist)).version).toBe(first.version)
	await writeFile(join(dist, "index.html"), "<h1>home, changed</h1>")
	expect((await writeServiceWorker(dist)).version).not.toBe(first.version)
})
