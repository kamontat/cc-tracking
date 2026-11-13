<script lang="ts">
	import type { LimitsSort, LimitsView } from "#lib/domain/limits-view"
	import type { Owner } from "#lib/domain/owner"
	import type { SortDir } from "#lib/domain/sort"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { SheetTab } from "#lib/ui/sheet-tab"

	import { onMount } from "svelte"

	import FilterChips from "#components/molecules/FilterChips.svelte"
	import SortChoices from "#components/molecules/SortChoices.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { DEFAULT_LIMITS_VIEW, LIMITS_DIRS, LIMITS_SORTS } from "#lib/domain/limits-view"
	import { OWNERS } from "#lib/domain/owner"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { toggled } from "#lib/ui/toggle"

	/**
	 * The Limits tab's filter sheet (RD-22), drawn like Cards': *Account holder* on its Filter tab
	 * and *Sort by* (name, room, used, with which way, `SortChoices`) on its Sort tab, under the
	 * heading *Filter limits*, then *Clear all* (which keeps the search) and *Show N limits*. It
	 * edits a draft of `view`, counted live by `count`; only the apply button hands it back, once
	 * the sheet has slid away (`onapply`). Close, Escape and the backdrop call `onclose`.
	 */
	interface Props {
		/** The tab to open on: the control that opened the sheet. */
		tab?: SheetTab
		view: LimitsView
		/** How many groups a view would show. */
		count: (view: LimitsView) => number
		onapply: (view: LimitsView) => void
		onclose: () => void
	}

	const { view, count, onapply, onclose, tab }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	// svelte-ignore state_referenced_locally
	let draft = $state.raw<LimitsView>({ ...view })

	const shown = $derived(count(draft))
	const ownerOptions = OWNERS.map((owner) => ({ value: owner, label: owner }))
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "limits.filter.show.one" : "limits.filter.show.many", { count: shown })
	})

	const set = (patch: Partial<LimitsView>) => {
		draft = { ...draft, ...patch }
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<FilterSheet
	heading={tr("limits.filter.title")}
	{shown}
	label={showLabel}
	onclear={() => {
		draft = { ...DEFAULT_LIMITS_VIEW, q: draft.q }
	}}
	onapply={() => onapply({ ...draft })}
	{tab}
	{onclose}>
	{#snippet filterPart()}
		<FilterChips
			legend={tr("ready.filter.owner")}
			name="owner"
			options={ownerOptions}
			selected={draft.owners}
			ontoggle={(owner: string) => set({ owners: toggled(draft.owners, owner as Owner) })} />
	{/snippet}
	{#snippet sortPart()}
		<SortChoices
			legend={tr("cards.filter.sortBy")}
			fields={LIMITS_SORTS}
			defaults={LIMITS_DIRS}
			field={draft.sort}
			dir={draft.dir}
			onchange={(pick: { field: LimitsSort; dir: SortDir }) => set({ sort: pick.field, dir: pick.dir })} />
	{/snippet}
</FilterSheet>
