<script lang="ts">
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { SheetTab } from "#lib/ui/sheet-tab"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The search box, the Filter button (its badge counts the filters in use), the sort chip, the group chip and a
	 * removable chip per filter, drawn in the light DOM where app.css's `.tx-controls` styles them.
	 * The Filter button, the sort chip and the group chip all call `onopen`, for the page to show its filter sheet.
	 */
	interface Props {
		q: string
		placeholder: string
		/** Every keystroke in the search box, with the box's whole value. */
		onsearch: (q: string) => void
		/** Opens the page's filter sheet on a tab: the Filter button's, the sort chip's or the group chip's. */
		onopen: (tab: SheetTab) => void
		/** How many filters are in use, for the Filter button's badge. */
		count: number
		/** The sort's own words, for the sort chip; none draws no sort chip (the Lists view). */
		sort?: string
		/** The grouping's own words, for a group chip after the sort chip; none draws no group chip. */
		group?: string
		/**
		 * One removable chip per filter in use: `label` is drawn and read out by its remove label. A
		 * card's chip also passes its `short` form, which app.css shows in its place on a phone (UI-14).
		 */
		chips: { key: string; label: string; short?: string; clear: () => void }[]
	}

	const { q, placeholder, onsearch, onopen, count, sort, group, chips }: Props = $props()

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
		<button type="button" class="tx-fbtn" data-variant="quiet" data-action="filter" onclick={() => onopen("filter")}>
			<SvgIcon name="filter" />
			{tr("tx.filter.open")}
			{#if count}
				<b class="tx-count">{count}</b>
			{/if}
		</button>
	</div>
	<div class="tx-chips">
		{#if sort !== undefined}
			<button
				type="button"
				class="tx-chip tx-sort"
				data-variant="quiet"
				data-action="sort"
				onclick={() => onopen("sort")}>
				{tr("tx.sortChip", { sort })}
				▾
			</button>
		{/if}
		{#if group !== undefined}
			<button
				type="button"
				class="tx-chip tx-sort"
				data-variant="quiet"
				data-action="group"
				onclick={() => onopen("group")}>
				{tr("groupChip", { group })}
				▾
			</button>
		{/if}
		{#each chips as chip (chip.key)}
			<button
				type="button"
				class="tx-chip"
				data-variant="quiet"
				data-chip={chip.key}
				aria-label={tr("tx.chip.remove", { filter: chip.label })}
				onclick={chip.clear}>
				{#if chip.short}
					<span class="cl"
						><span class="cl-full">{chip.label}</span
						><span class="cl-short" aria-hidden="true">{chip.short}</span></span
					>
				{:else}
					{chip.label}
				{/if}
				×
			</button>
		{/each}
	</div>
</div>
