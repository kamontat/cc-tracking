<script lang="ts" generics="F extends SortField">
	import type { SortDir } from "#lib/domain/sort"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { sortFieldLabel, sortOrderLabel } from "#lib/ui/sort-label"

	/**
	 * A filter sheet's *Sort* section: a pill chip per field (`data-sort`), then, in a group named
	 * *Order*, the picked field's two directions in words (`data-dir`: *Newest first*, *Oldest
	 * first*), its own direction first. A new field starts in its own direction (`defaults`); an
	 * order keeps the field. Each pick goes to `onchange`.
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
	const orderLabel = (value: SortDir) => {
		void lang
		return sortOrderLabel(field, value)
	}

	const orders = $derived<SortDir[]>(defaults[field] === "asc" ? ["asc", "desc"] : ["desc", "asc"])

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<fieldset class="filter-group">
	<legend>{legend}</legend>
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
	<fieldset class="filter-chips filter-order" aria-label={tr("sort.order")}>
		{#each orders as value (value)}
			<button
				type="button"
				data-variant="quiet"
				data-dir={value}
				aria-pressed={dir === value ? "true" : "false"}
				onclick={() => onchange({ field, dir: value })}>
				<span aria-hidden="true">{value === "asc" ? "↑" : "↓"}</span>
				{orderLabel(value)}
			</button>
		{/each}
	</fieldset>
</fieldset>
