#!/usr/bin/env bun
import { $ } from "bun";
import { resolveBuildEnv } from "./build-env";

/**
 * Wraps `bun-server build` with the commit and build time Settings > About shows. The bundler
 * inlines every `BUN_PUBLIC_*` variable, so the pair has to be in the environment before it
 * starts -- hence a wrapper rather than a flag.
 *
 * A tree without git (a source tarball, a sandbox) builds fine: the sha comes out empty and
 * About shows no commit.
 */
const git = await $`git rev-parse HEAD`.nothrow().quiet();
const sha = git.exitCode === 0 ? git.stdout.toString() : "";
const ref = await $`git rev-parse --abbrev-ref HEAD`.nothrow().quiet();
const branch = ref.exitCode === 0 ? ref.stdout.toString() : "";

const built = resolveBuildEnv({
	sha,
	branch,
	now: new Date(),
	env: process.env,
});
const proc = Bun.spawn(["bunx", "bun-server", "build", ...Bun.argv.slice(2)], {
	stdio: ["inherit", "inherit", "inherit"],
	env: { ...process.env, ...built },
});

const code = await proc.exited;
// Home must land at the output's root; anywhere else means the bundle lost its root (see
// scripts/routes-root.ts) and no page would answer at its address.
if (code === 0 && !(await Bun.file("dist/index.html").exists())) {
	console.error(
		"Build put the pages outside dist/; see scripts/routes-root.ts.",
	);
	process.exit(1);
}
process.exit(code);
