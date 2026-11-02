import { expect, test } from "bun:test";
import { resolve } from "node:path";
import type { PluginBuilder } from "bun";
import routesRoot, { ROUTES } from "./routes-root";

const run = (config: { root?: string }) => {
	routesRoot.setup({ config } as unknown as PluginBuilder);
	return config.root;
};

test("the bundle is rooted at the routes, so a page keeps its address in dist", () => {
	expect(ROUTES).toBe(resolve(import.meta.dir, "../src/routes"));
	expect(run({})).toBe(ROUTES);
});

test("a root someone set on purpose is left alone", () => {
	expect(run({ root: "/elsewhere" })).toBe("/elsewhere");
});

test("bun-server loads the plugin for the build", async () => {
	const bunfig = Bun.TOML.parse(
		await Bun.file(resolve(import.meta.dir, "../bunfig.toml")).text(),
	) as { serve?: { static?: { plugins?: string[] } } };
	expect(bunfig.serve?.static?.plugins).toContain("./scripts/routes-root.ts");
});
