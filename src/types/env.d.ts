// The variables the bundler inlines (it bundles with `env: "BUN_PUBLIC_*"`): the commit and
// build time `scripts/build.ts` sets, and the PR number the preview deploy workflow sets. Declared so `build-info.ts` can reach them by dot access, which is
// the only form the bundler rewrites into a literal -- bracket access would survive into the
// browser bundle and read from a `process` that is not there.
declare module "bun" {
	interface Env {
		BUN_PUBLIC_COMMIT_SHA?: string;
		BUN_PUBLIC_BUILT_AT?: string;
		BUN_PUBLIC_PR_NUMBER?: string;
	}
}
