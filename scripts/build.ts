#!/usr/bin/env bun
import { $ } from "bun";
import { resolveBuildEnv } from "./build-env";

/**
 * Wraps `bun-server build` with the commit and build time the footer shows. The bundler
 * inlines every `BUN_PUBLIC_*` variable, so the pair has to be in the environment before it
 * starts -- hence a wrapper rather than a flag.
 *
 * A tree without git (a source tarball, a sandbox) builds fine: the sha comes out empty and
 * the footer reads `dev`.
 */
const git = await $`git rev-parse HEAD`.nothrow().quiet();
const sha = git.exitCode === 0 ? git.stdout.toString() : "";

const built = resolveBuildEnv({ sha, now: new Date(), env: process.env });
const proc = Bun.spawn(["bunx", "bun-server", "build", ...Bun.argv.slice(2)], {
	stdio: ["inherit", "inherit", "inherit"],
	env: { ...process.env, ...built },
});

process.exit(await proc.exited);
