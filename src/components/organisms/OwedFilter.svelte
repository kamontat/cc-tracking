<script lang="ts">
	import type { OwedKind, OwedPlanView } from "#lib/domain/owed-plan"
	import type { LocationRecord, OwnerRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import FilterChips from "#components/molecules/FilterChips.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { DEFAULT_OWED_PLAN, OWED_KINDS, OWED_RANGES } from "#lib/domain/owed-plan"
	import { sortOwners } from "#lib/domain/owner"
	import { locationName, sortLocations } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { toggled } from "#lib/ui/toggle"

	/**
	 * The _Owed_ tab's filter sheet, under *Filter what to pay*, with no sort and no group: *Range*
	 * (one of 7, 14, 30 or 60 days, or everything owed), *Kept in*, *Account holder* and *Shows*
	 * (bills, planned payments, open statements), then *Clear all* and *Show N days*. It edits a
	 * draft of `view`, counted live by `count`; only the apply button hands it back (`onapply`).
	 */
	interface Props {
		view: OwedPlanView
		locations: LocationRecord[]
		owners: readonly OwnerRecord[]
		/** How many days a view would show. */
		count: (view: OwedPlanView) => number
		onapply: (view: OwedPlanView) => void
		onclose: () => void
	}

	const { view, locations, owners, count, onapply, onclose }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	// svelte-ignore state_referenced_locally
	let draft = $state.raw<OwedPlanView>({ ...view })

	const shown = $derived(count(draft))
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "owed.plan.filter.show.one" : "owed.plan.filter.show.many", { count: shown })
	})
	const ranges = $derived.by(() => {
		void lang
		return OWED_RANGES.map((range) => ({
			value: String(range),
			label: range === "all" ? t("owed.plan.range.all") : t("owed.plan.range.days", { count: range }),
		}))
	})
	const places = $derived.by(() => {
		void lang
		return sortLocations(locations).map((record) => ({ value: record.id, label: locationName(record) }))
	})
	const ownerOptions = $derived(sortOwners(owners).map((owner) => ({ value: owner.id, label: owner.name })))
	const kinds = $derived.by(() => {
		void lang
		return OWED_KINDS.map((kind) => ({ value: kind, label: t(`owed.plan.kind.${kind}`) }))
	})

	const set = (patch: Partial<OwedPlanView>) => {
		draft = { ...draft, ...patch }
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<FilterSheet
	heading={tr("owed.plan.filter.title")}
	{shown}
	label={showLabel}
	onclear={() => {
		draft = { ...DEFAULT_OWED_PLAN, q: draft.q, layout: draft.layout }
	}}
	onapply={() => onapply({ ...draft })}
	{onclose}>
	{#snippet filterPart()}
		<FilterChips
			legend={tr("owed.plan.filter.range")}
			name="range"
			options={ranges}
			selected={[String(draft.range)]}
			ontoggle={(value: string) =>
				set({ range: OWED_RANGES.find((r) => String(r) === value) ?? DEFAULT_OWED_PLAN.range })} />
		<FilterChips
			legend={tr("ready.filter.location")}
			name="location"
			options={places}
			selected={draft.locations}
			ontoggle={(location: string) => set({ locations: toggled(draft.locations, location) })} />
		<FilterChips
			legend={tr("ready.filter.owner")}
			name="owner"
			options={ownerOptions}
			selected={draft.owners}
			ontoggle={(owner: string) => set({ owners: toggled(draft.owners, owner) })} />
		<FilterChips
			legend={tr("owed.plan.filter.shows")}
			name="kind"
			options={kinds}
			selected={draft.shows}
			ontoggle={(kind: string) =>
				set({ shows: OWED_KINDS.filter((k) => toggled(draft.shows, kind as OwedKind).includes(k)) })} />
	{/snippet}
</FilterSheet>
