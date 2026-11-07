<script lang="ts">
	import type { Owner } from "#lib/domain/owner"
	import type { LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import Sheet from "#components/molecules/Sheet.svelte"
	import { READY_SORTS, type ReadySort } from "#lib/domain/home"
	import { DEFAULT_READY_FILTER, type ReadyFilter } from "#lib/domain/ready-filter"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The new-list picker's filter sheet (DD-103), under *Filter and sort*: *Kept in* (the places
	 * the ready cards are kept in), *Account holder* and *Sort*, as pill chips, then *Clear all* and
	 * *Show N cards*. It edits a draft of `filter` and `sort`, counted live by `count`; only the
	 * apply button hands it back, once the sheet has slid away (`onapply`). Close, Escape and the
	 * backdrop call `onclose`. A group with nothing to offer is left out.
	 */
	interface Props {
		/** The ids of the places to offer, in order: those the ready cards are kept in. */
		locations: string[]
		/** The stored locations, which name the places offered. */
		records: LocationRecord[]
		/** The account holders to offer: those of the ready cards. */
		owners: Owner[]
		filter: ReadyFilter
		sort: ReadySort
		/** How many cards a filter would show. */
		count: (filter: ReadyFilter) => number
		/** The draft, once the sheet has slid away; the page takes the sheet off screen. */
		onapply: (detail: { filter: ReadyFilter; sort: ReadySort }) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
	}

	const { locations, records, owners, filter, sort, count, onapply, onclose }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/** A place's name in the reader's language. */
	const placeName = (id: string) => {
		void lang
		return nameOfLocation(records, id)
	}

	let sheet: { leave: (then: () => void) => void } | undefined = $state()
	// A copy of the filter and sort the sheet opened with; the page renders a new sheet for new ones.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<ReadyFilter>({ ...filter })
	// svelte-ignore state_referenced_locally
	let draftSort = $state<ReadySort>(sort)

	const shown = $derived(count(draft))
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "ready.filter.show.one" : "ready.filter.show.many", { count: shown })
	})

	/** `values` with `value` added, or taken out when it is there. */
	function toggle<T>(values: readonly T[], value: T): T[] {
		return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
	}

	const apply = () => {
		const value = { filter: { ...draft }, sort: draftSort }
		const emit = () => onapply(value)
		if (sheet) sheet.leave(emit)
		else emit()
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<Sheet bind:this={sheet} heading={tr("tx.filter.title")} {onclose}>
	{#if locations.length > 0}
		<fieldset>
			<legend>{tr("ready.filter.location")}</legend>
			<div class="choices">
				{#each locations as location (location)}
					<button
						type="button"
						data-variant="quiet"
						data-location={location}
						aria-pressed={draft.locations.includes(location) ? "true" : "false"}
						onclick={() => {
							draft = { ...draft, locations: toggle(draft.locations, location) }
						}}>
						{placeName(location)}
					</button>
				{/each}
			</div>
		</fieldset>
	{/if}
	{#if owners.length > 0}
		<fieldset>
			<legend>{tr("ready.filter.owner")}</legend>
			<div class="choices">
				{#each owners as owner (owner)}
					<button
						type="button"
						data-variant="quiet"
						data-owner={owner}
						aria-pressed={draft.owners.includes(owner) ? "true" : "false"}
						onclick={() => {
							draft = { ...draft, owners: toggle(draft.owners, owner) }
						}}>
						{owner}
					</button>
				{/each}
			</div>
		</fieldset>
	{/if}
	<fieldset>
		<legend>{tr("tx.filter.sort")}</legend>
		<div class="choices">
			{#each READY_SORTS as option (option)}
				<button
					type="button"
					data-variant="quiet"
					data-sort={option}
					aria-pressed={draftSort === option ? "true" : "false"}
					onclick={() => {
						draftSort = option
					}}>
					{tr(`ready.sort.${option}`)}
				</button>
			{/each}
		</div>
	</fieldset>
	<div class="footer">
		<button
			type="button"
			data-variant="quiet"
			data-action="clear"
			onclick={() => {
				draft = { ...DEFAULT_READY_FILTER, q: draft.q }
				draftSort = "room"
			}}>
			{tr("tx.filter.clear")}
		</button>
		<button type="button" data-action="apply" disabled={shown === 0} onclick={apply}>{showLabel}</button>
	</div>
</Sheet>

<style>
	/* The legacy `filterSheet` look: a muted legend over a wrapping row of pill chips. */
	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		font-weight: 400;
		letter-spacing: normal;
		text-transform: none;
		color: var(--cc-text-muted);
	}

	.choices {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--cc-space-2);
	}

	/* Raised over app.css's `.page button`. */
	.choices button[aria-pressed] {
		padding: var(--cc-space-1) var(--cc-space-3);
		font-weight: 400;
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: transparent;
		border-radius: var(--cc-radius-pill);
	}

	.choices button[aria-pressed]:hover {
		background: var(--cc-border);
	}

	.choices button[aria-pressed="true"] {
		font-weight: 600;
		color: var(--cc-success);
		background: var(--cc-accent-surface);
	}

	.footer {
		display: flex;
		flex-direction: row;
		gap: var(--cc-space-2);
	}

	.footer button[data-action] {
		padding-block: var(--cc-space-3);
		font-size: var(--cc-text-md);
		font-weight: 650;
	}

	.footer button[data-action="apply"] {
		flex: 1 1 auto;
	}
</style>
