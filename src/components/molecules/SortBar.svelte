<script lang="ts" generics="F extends SortField">
	import type { SortDir } from "#lib/domain/sort"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { sortFieldLabel, sortOrderLabel } from "#lib/ui/sort-label"

	/**
	 * A list's sort on its own row, for a tab with no filter sheet (Home's _Owed_ and _Ready to
	 * use_): a _Sort_ chip holding a select of the fields, then the order switch (↓ | ↑, the field's
	 * own way first, each named by its full words, DD-193). A new field starts in its own direction
	 * (`defaults`); an order keeps the field. The chip is marked while the order is not the list's
	 * own (`initial` in its own direction).
	 */
	interface Props {
		fields: readonly F[]
		/** Each field's own direction. */
		defaults: Record<F, SortDir>
		/** The list's own sort, in its own direction: the chip is plain there. */
		initial: F
		field: F
		dir: SortDir
		onchange: (field: F, dir: SortDir) => void
	}

	const { fields, defaults, initial, field, dir, onchange }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}
	const fieldLabel = (value: F) => {
		void lang
		return sortFieldLabel(value)
	}

	/** The order switch's two ways, the field's own first, each named by its full words. */
	const ways = $derived.by(() => {
		void lang
		const own = defaults[field]
		return ([own, own === "asc" ? "desc" : "asc"] as SortDir[]).map((way) => ({
			dir: way,
			label: sortOrderLabel(field, way),
		}))
	})

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="sort-bar" row>
	<label class="chip" data-active={field !== initial || dir !== defaults[initial] ? "" : undefined}>
		{tr("list.sort")}
		<select
			name="sort"
			value={field}
			onchange={(event) => {
				const next = event.currentTarget.value as F
				onchange(next, defaults[next])
			}}>
			{#each fields as option (option)}
				<option value={option}>{fieldLabel(option)}</option>
			{/each}
		</select>
	</label>
	<fieldset class="filter-seg" aria-label={tr("sort.order")}>
		{#each ways as way (way.dir)}
			<button
				type="button"
				data-variant="quiet"
				data-dir={way.dir}
				aria-pressed={dir === way.dir ? "true" : "false"}
				aria-label={way.label}
				title={way.label}
				onclick={() => onchange(field, way.dir)}>
				{way.dir === "asc" ? "↑" : "↓"}
			</button>
		{/each}
	</fieldset>
</div>

<style>
	.sort-bar {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: var(--cc-space-1);
	}

	/* The legacy `listControls` chip: its name, then a select stripped of its own box. */
	.chip {
		display: flex;
		flex-direction: row;
		gap: var(--cc-space-1);
		align-items: center;
		padding-inline-start: var(--cc-space-3);
		color: var(--cc-text-muted);
		white-space: nowrap;
		background: var(--cc-surface-sunken);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.chip[data-active] {
		color: var(--cc-link);
		border-color: var(--cc-accent);
	}

	/* A select stripped of its own box, painting the chevron the legacy shadow root gave every
	   select, with a token gutter on both sides of it. background-color, not the shorthand: the
	   chevron is a background-image. Two classes, to outrank app.css's form rules. */
	.sort-bar .chip select {
		appearance: none;
		inline-size: auto;
		padding-block: var(--cc-space-1);
		padding-inline-start: var(--cc-space-1);
		padding-inline-end: calc(var(--cc-space-3) * 2 + var(--cc-select-chevron-size));
		font: inherit;
		font-size: var(--cc-text-sm);
		color: var(--cc-text);
		background-color: transparent;
		background-image: var(--cc-select-chevron);
		background-repeat: no-repeat;
		background-position: right var(--cc-space-3) center;
		background-size: var(--cc-select-chevron-size);
		border: 0;
	}
</style>
