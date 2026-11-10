<script lang="ts">
	import type { Card } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardChoices } from "#lib/ui/card-choices"
	import { cardLine } from "#lib/ui/card-label"

	/**
	 * A filter sheet's *Card* section: a pill chip per card in the line form (UI-14), each a toggle
	 * handed to `ontoggle`. Past eight cards it stays short (`cardChoices`): a *Find a card* box
	 * narrows the chips by id, name or last 4, and with no find only the first eight show, plus any
	 * card picked when the sheet opened or tapped since, with *Show all N cards* / *Show fewer*.
	 */
	interface Props {
		legend: string
		cards: Card[]
		selected: readonly string[]
		ontoggle: (id: string) => void
	}

	const { legend, cards, selected, ontoggle }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let query = $state("")
	let expanded = $state(false)
	// The cards picked when the sheet opened, and every card tapped since, stay past the fold.
	// svelte-ignore state_referenced_locally
	let pinned = $state.raw<string[]>([...selected])

	const choices = $derived(cardChoices(cards, pinned, query, expanded))

	const toggle = (id: string) => {
		if (!pinned.includes(id)) pinned = [...pinned, id]
		ontoggle(id)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<fieldset class="filter-group">
	<legend>{legend}</legend>
	{#if choices.findable}
		<label class="tx-search filter-find"
			><SvgIcon name="search" />
			<input
				type="search"
				name="cardq"
				value={query}
				aria-label={tr("filter.cards.find")}
				placeholder={tr("filter.cards.find")}
				oninput={(event) => {
					query = event.currentTarget.value
				}}></label
		>
	{/if}
	<div class="filter-chips">
		{#each choices.shown as card (card.id)}
			<button
				type="button"
				data-variant="quiet"
				data-card={card.id}
				aria-pressed={selected.includes(card.id) ? "true" : "false"}
				onclick={() => toggle(card.id)}>
				{cardLine(card.id, card)}
			</button>
		{/each}
		{#if choices.findable && choices.hidden > 0}
			<button
				type="button"
				class="filter-more"
				data-variant="quiet"
				data-action="more-cards"
				onclick={() => {
					expanded = true
				}}>
				{tr("filter.cards.more", { count: cards.length })}
			</button>
		{:else if expanded && query.trim() === ""}
			<button
				type="button"
				class="filter-more"
				data-variant="quiet"
				data-action="more-cards"
				onclick={() => {
					expanded = false
				}}>
				{tr("filter.cards.less")}
			</button>
		{/if}
	</div>
	{#if choices.shown.length === 0}
		<p class="filter-none">{tr("filter.cards.none")}</p>
	{/if}
</fieldset>
