<script lang="ts" generics="F extends SortField">
	import type { SortDir } from "#lib/domain/sort"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { sortFieldLabel, sortOrderLabel, sortShortLabel } from "#lib/ui/sort-label"

	/**
	 * A filter sheet's *Sort* section (DD-193): the legend with, at the right of its row, a
	 * two-part switch named *Order* holding the picked field's two directions in short words with
	 * an arrow (`data-dir`: *↓ Newest* | *↑ Oldest*, its own direction first, each button named by
	 * the full words, *Newest first*), then a pill chip per field (`data-sort`). A new field starts
	 * in its own direction (`defaults`); an order keeps the field. Each pick goes to `onchange`.
	 */
	interface Props {
		legend: string
		fields: readonly F[]
		/** Each field's own direction. */
		defaults: Record<F, SortDir>
		field: F
		dir: SortDir
		onchange: (pick: { field: F; dir: SortDir }) => void
	}

	const { legend, fields, defaults, field, dir, onchange }: Props = $props()

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
	const order = (value: SortDir) => {
		void lang
		return { short: sortShortLabel(field, value), full: sortOrderLabel(field, value) }
	}

	const orders = $derived<SortDir[]>(defaults[field] === "asc" ? ["asc", "desc"] : ["desc", "asc"])

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<fieldset class="filter-group filter-sort">
	<legend>{legend}</legend>
	<div class="filter-head">
		<fieldset class="filter-seg" aria-label={tr("sort.order")}>
			{#each orders as value (value)}
				{@const words = order(value)}
				<button
					type="button"
					data-variant="quiet"
					data-dir={value}
					aria-pressed={dir === value ? "true" : "false"}
					aria-label={words.full}
					onclick={() => onchange({ field, dir: value })}>
					<span aria-hidden="true">{value === "asc" ? "↑" : "↓"}</span>
					{words.short}
				</button>
			{/each}
		</fieldset>
	</div>
	<div class="filter-chips">
		{#each fields as value (value)}
			<button
				type="button"
				data-variant="quiet"
				data-sort={value}
				aria-pressed={field === value ? "true" : "false"}
				onclick={() => {
					if (value !== field) onchange({ field: value, dir: defaults[value] })
				}}>
				{fieldLabel(value)}
			</button>
		{/each}
	</div>
</fieldset>
