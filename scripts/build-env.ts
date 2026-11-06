export type BuildEnv = {
	PUBLIC_COMMIT_SHA: string
	PUBLIC_BUILT_AT: string
	PUBLIC_PR_NUMBER: string
	PUBLIC_ENVIRONMENT: string
	PUBLIC_BRANCH: string
}

export type BuildEnvInput = {
	/** What `git rev-parse HEAD` printed, or `""` when git could not answer. */
	sha: string
	/** What `git rev-parse --abbrev-ref HEAD` printed; `""` (the default) when it could not answer. */
	branch?: string
	now: Date
	env: Partial<BuildEnv>
}

/**
 * The build stamps `astro.config.ts` puts in the environment, which Vite inlines into the bundle
 * as `import.meta.env.PUBLIC_*` (see `#lib/ui/build-info`).
 *
 * An value already in the environment wins over what git says: a CI job building from a
 * detached or shallow checkout knows the commit it was triggered for, and git there may not.
 *
 * The environment is `local` unless a deploy workflow says otherwise. The branch from the
 * checkout reads `HEAD` on a detached CI checkout, which is why the workflows set it explicitly.
 *
 * The PR number only ever comes from the preview deploy workflow, but it is always set, empty
 * elsewhere, so every build carries the same five stamps.
 */
export function resolveBuildEnv({ sha, branch = "", now, env }: BuildEnvInput): BuildEnv {
	return {
		PUBLIC_COMMIT_SHA: env.PUBLIC_COMMIT_SHA ?? sha.trim(),
		PUBLIC_BUILT_AT: env.PUBLIC_BUILT_AT ?? now.toISOString(),
		PUBLIC_PR_NUMBER: env.PUBLIC_PR_NUMBER ?? "",
		PUBLIC_ENVIRONMENT: env.PUBLIC_ENVIRONMENT ?? "local",
		PUBLIC_BRANCH: env.PUBLIC_BRANCH ?? branch.trim(),
	}
}
