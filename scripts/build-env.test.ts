import { expect, test } from "bun:test";
import { resolveBuildEnv } from "./build-env";

const now = new Date(Date.UTC(2026, 8, 24, 13, 12));

test("stamps the commit git reports and the moment of the build", () => {
	expect(resolveBuildEnv({ sha: "7ba698c\n", now, env: {} })).toEqual({
		BUN_PUBLIC_COMMIT_SHA: "7ba698c",
		BUN_PUBLIC_BUILT_AT: "2026-09-24T13:12:00.000Z",
	});
});

test("keeps a commit the environment already carries, as CI may know better than git", () => {
	const env = { BUN_PUBLIC_COMMIT_SHA: "deadbee" };

	expect(
		resolveBuildEnv({ sha: "7ba698c", now, env }).BUN_PUBLIC_COMMIT_SHA,
	).toBe("deadbee");
});

test("keeps a build time the environment already carries", () => {
	const env = { BUN_PUBLIC_BUILT_AT: "2020-01-01T00:00:00.000Z" };

	expect(
		resolveBuildEnv({ sha: "7ba698c", now, env }).BUN_PUBLIC_BUILT_AT,
	).toBe("2020-01-01T00:00:00.000Z");
});

test("stamps an empty commit when git had nothing to say, so the page reads dev", () => {
	expect(resolveBuildEnv({ sha: "", now, env: {} }).BUN_PUBLIC_COMMIT_SHA).toBe(
		"",
	);
});
