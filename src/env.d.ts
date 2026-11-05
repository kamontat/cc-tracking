interface ImportMetaEnv {
	/** Google Tag Manager container id, inlined by `astro build`; see `#lib/gtm`. */
	readonly PUBLIC_GTM_ID?: string;
	// The build stamps `astro.config.ts` sets (see `scripts/build-env.ts`) and Settings > About,
	// the tab title and the header tint read through `#lib/ui/build-info`.
	readonly PUBLIC_COMMIT_SHA?: string;
	readonly PUBLIC_BUILT_AT?: string;
	readonly PUBLIC_PR_NUMBER?: string;
	readonly PUBLIC_ENVIRONMENT?: string;
	readonly PUBLIC_BRANCH?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
