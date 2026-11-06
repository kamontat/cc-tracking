<script lang="ts">
	import type { Locale, MessageKey } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { getLocale, setLocale, subscribe, t } from "#lib/i18n/index"
	import { getTheme, setTheme, type Theme } from "#lib/ui/theme"

	/**
	 * The reader's own display choices (RD-19): language and colour theme, as two settings rows
	 * each with a segmented choice. Both live in this browser's storage rather than the
	 * repository, so they apply before any data loads and are not carried along in a backup. The
	 * page supplies the section's heading and its `.set` panel; the choices are the browser's, so
	 * this is an island (PRD DD-172).
	 */
	const LOCALES: readonly Locale[] = ["en", "th"]

	/** Each language named in its own script, so a reader lost in the other one still finds theirs. */
	const LOCALE_KEYS: Record<Locale, MessageKey> = { en: "lang.en", th: "lang.th" }

	/** Light and Dark first, then the device's own choice, as the prototype orders them. */
	const THEMES: readonly Theme[] = ["light", "dark", "system"]

	const THEME_KEYS: Record<Theme, MessageKey> = { system: "theme.system", light: "theme.light", dark: "theme.dark" }

	let lang = $state(getLocale())
	let theme = $state(getTheme())

	const tr = (key: MessageKey) => {
		void lang
		return t(key)
	}

	const pickTheme = (value: Theme) => {
		setTheme(value)
		theme = value
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="set-row" data-row="language">
	<span id="display-language">{tr("lang.label")}</span>
	<fieldset class="seg" aria-labelledby="display-language">
		{#each LOCALES as option (option)}
			<button
				type="button"
				data-value={option}
				lang={option}
				aria-pressed={option === lang ? "true" : "false"}
				onclick={() => setLocale(option)}>
				{tr(LOCALE_KEYS[option])}
			</button>
		{/each}
	</fieldset>
</div>
<div class="set-row" data-row="theme">
	<span id="display-theme">{tr("theme.label")}</span>
	<fieldset class="seg" aria-labelledby="display-theme">
		{#each THEMES as option (option)}
			<button
				type="button"
				data-value={option}
				aria-pressed={option === theme ? "true" : "false"}
				onclick={() => pickTheme(option)}>
				{tr(THEME_KEYS[option])}
			</button>
		{/each}
	</fieldset>
</div>

<style>
	/* The island sits between the panel and its rows, so the rule between them is drawn here. */
	.set-row + .set-row {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	/* A row holding choices, not one that is itself an action. */
	:global(.page) .set-row {
		flex-wrap: wrap;
		gap: var(--cc-space-1) var(--cc-space-3);
		cursor: default;
	}

	/* A fieldset, so it is named as a group; it keeps none of a fieldset's own frame. */
	.seg {
		min-inline-size: 0;
		margin: 0;
		border: 0;
		display: inline-grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		padding: calc(var(--cc-space-1) * 0.75);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.seg button {
		padding: var(--cc-space-1) var(--cc-space-3);
		font-weight: 600;
		color: var(--cc-text-muted);
		text-align: center;
		background: transparent;
		border: 0;
		border-radius: calc(var(--cc-radius-sm) - var(--cc-space-1) * 0.75);
	}

	.seg button:hover {
		color: var(--cc-text);
		background: transparent;
	}

	.seg button[aria-pressed="true"] {
		color: var(--cc-text);
		background: var(--cc-surface);
		box-shadow: var(--cc-shadow-sm);
	}
</style>
