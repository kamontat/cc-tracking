export type BuildEnv = {
	BUN_PUBLIC_COMMIT_SHA: string;
	BUN_PUBLIC_BUILT_AT: string;
	BUN_PUBLIC_PR_NUMBER: string;
};

export type BuildEnvInput = {
	/** What `git rev-parse HEAD` printed, or `""` when git could not answer. */
	sha: string;
	now: Date;
	env: Record<string, string | undefined>;
};

/**
 * The values `bun-server build` inlines into the bundle (it bundles with `env: "BUN_PUBLIC_*"`).
 *
 * An value already in the environment wins over what git says: a CI job building from a
 * detached or shallow checkout knows the commit it was triggered for, and git there may not.
 *
 * The PR number only ever comes from the preview deploy workflow, but it is always set, empty
 * elsewhere: the bundler only rewrites variables that exist, and an unset one would survive
 * into the browser as a `process.env` read that throws.
 */
export function resolveBuildEnv({ sha, now, env }: BuildEnvInput): BuildEnv {
	return {
		BUN_PUBLIC_COMMIT_SHA: env.BUN_PUBLIC_COMMIT_SHA ?? sha.trim(),
		BUN_PUBLIC_BUILT_AT: env.BUN_PUBLIC_BUILT_AT ?? now.toISOString(),
		BUN_PUBLIC_PR_NUMBER: env.BUN_PUBLIC_PR_NUMBER ?? "",
	};
}
