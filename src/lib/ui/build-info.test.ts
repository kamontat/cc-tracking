import { afterEach, expect, test } from "bun:test";
import {
	buildInfo,
	commitUrl,
	formatBuiltAt,
	parseBuiltAt,
	REPO_URL,
	shortCommit,
} from "#lib/ui/build-info";

const SHA = "7ba698c1d4f0a2b3c4d5e6f708192a3b4c5d6e7f";

afterEach(() => {
	delete process.env.BUN_PUBLIC_COMMIT_SHA;
	delete process.env.BUN_PUBLIC_BUILT_AT;
});

test("shortens a commit sha to the seven characters GitHub shows", () => {
	expect(shortCommit(SHA)).toBe("7ba698c");
});

test("shortens nothing when there is no commit", () => {
	expect(shortCommit("")).toBe("");
});

test("links a commit by its full sha under the repository", () => {
	expect(commitUrl(SHA)).toBe(`${REPO_URL}/commit/${SHA}`);
});

/**
 * Built in UTC on purpose: a deploy timestamp is compared against other deploys, not
 * against the reader's day, so it must read the same wherever it is opened.
 */
test("prints the build time in UTC, padded, whatever the reader's timezone", () => {
	const when = new Date(Date.UTC(2026, 8, 24, 6, 5));
	expect(formatBuiltAt(when)).toBe("2026-09-24 06:05 UTC");
});

test("reads an ISO build timestamp", () => {
	expect(parseBuiltAt("2026-09-24T13:12:00Z")?.getTime()).toBe(
		Date.UTC(2026, 8, 24, 13, 12),
	);
});

test("reads no timestamp from an empty or unparsable value", () => {
	expect(parseBuiltAt("")).toBeNull();
	expect(parseBuiltAt("last tuesday")).toBeNull();
});

test("carries the commit and build time the bundler inlined", () => {
	process.env.BUN_PUBLIC_COMMIT_SHA = SHA;
	process.env.BUN_PUBLIC_BUILT_AT = "2026-09-24T13:12:00Z";

	expect(buildInfo()).toEqual({
		commit: SHA,
		builtAt: "2026-09-24T13:12:00Z",
	});
});

test("carries empty values when nothing was inlined, as in a dev server", () => {
	expect(buildInfo()).toEqual({ commit: "", builtAt: "" });
});
