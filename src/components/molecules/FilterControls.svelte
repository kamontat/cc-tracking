<script lang="ts">
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The search box, the Filter button (its badge counts the filters in use), the sort chip and a
	 * removable chip per filter, drawn in the light DOM where app.css's `.tx-controls` styles them.
	 * The Filter button and the sort chip both call `onopen`, for the page to show its filter sheet.
	 */
	interface Props {
		q: string
		placeholder: string
		/** Every keystroke in the search box, with the box's whole value. */
		onsearch: (q: string) => void
		onopen: () => void
		/** How many filters are in use, for the Filter button's badge. */
		count: number
		/** The sort's own words, for the sort chip. */
		sort: string
		/** One removable chip per filter in use: `label` is drawn and read out by its remove label. */
		chips: { key: string; label: string; clear: () => void }[]
	}

	const { q, placeholder, onsearch, onopen, count, sort, chips }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/**
	 * Listens on the box itself, as the Lit template did, rather than through Svelte's delegated
	 * root listener, so an `input` that does not bubble still reaches `onsearch`.
	 */
	const listen = (input: HTMLInputElement) => {
		const handle = () => onsearch(input.value)
		input.addEventListener("input", handle)
		return () => input.removeEventListener("input", handle)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="tx-controls">
	<div class="tx-ctl">
		<label class="tx-search"
			><SvgIcon name="search" />
			<input
				class="search"
				type="search"
				name="q"
				value={q}
				aria-label={tr("list.search")}
				{placeholder}
				{@attach listen}></label
		>
		<button type="button" class="tx-fbtn" data-variant="quiet" data-action="filter" onclick={onopen}>
			<SvgIcon name="filter" />
			{tr("tx.filter.open")}
			{#if count}
				<b class="tx-count">{count}</b>
			{/if}
		</button>
	</div>
	<div class="tx-chips">
		<button type="button" class="tx-chip tx-sort" data-variant="quiet" data-action="sort" onclick={onopen}>
			{tr("tx.sortChip", { sort })}
			▾
		</button>
		{#each chips as chip (chip.key)}
			<button
				type="button"
				class="tx-chip"
				data-variant="quiet"
				data-chip={chip.key}
				aria-label={tr("tx.chip.remove", { filter: chip.label })}
				onclick={chip.clear}>
				{chip.label}
				×
			</button>
		{/each}
	</div>
</div>
