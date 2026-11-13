<script lang="ts" generics="F extends SortField">
	import type { SortDir } from "#lib/domain/sort"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import SortChoices from "#components/molecules/SortChoices.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The filter sheet with only its *Sort* section (no tabs), for a tab with a sort and no filters
	 * (Home's _Owed_ and _Ready to use_), opened by `FilterControls`' sort chip as on Cards. It
	 * edits a draft of `field` and `dir`; *Clear all* goes back to the list's own sort (`initial`,
	 * in its own direction), and only the apply button (*Show N cards*) hands the pick back, once
	 * the sheet has slid away. Close, Escape and the backdrop call `onclose`.
	 */
	interface Props {
		heading: string
		fields: readonly F[]
		/** Each field's own direction. */
		defaults: Record<F, SortDir>
		/** The list's own sort, in its own direction: what *Clear all* goes back to. */
		initial: F
		field: F
		dir: SortDir
		/** How many cards the list shows, for the apply button. */
		shown: number
		/** The picked sort, once the sheet has slid away; the page takes the sheet off screen. */
		onapply: (field: F, dir: SortDir) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
	}

	const { heading, fields, defaults, initial, field, dir, shown, onapply, onclose }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	// A copy of the sort the sheet opened with; the page renders a new sheet for each opening.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<{ field: F; dir: SortDir }>({ field, dir })

	const label = $derived(tr(shown === 1 ? "ready.filter.show.one" : "ready.filter.show.many", { count: shown }))

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<FilterSheet
	{heading}
	tab="sort"
	{shown}
	{label}
	onclear={() => {
		draft = { field: initial, dir: defaults[initial] }
	}}
	onapply={() => onapply(draft.field, draft.dir)}
	{onclose}>
	{#snippet sortPart()}
		<SortChoices
			legend={tr("cards.filter.sortBy")}
			{fields}
			{defaults}
			field={draft.field}
			dir={draft.dir}
			onchange={(pick: { field: F; dir: SortDir }) => {
				draft = pick
			}} />
	{/snippet}
</FilterSheet>
