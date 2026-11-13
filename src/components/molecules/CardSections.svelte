<script lang="ts" generics="T">
	import type { Snippet } from "svelte"
	import type { CardSection, Sectioned } from "#lib/domain/cards-view"
	import type { Card, LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { takesPurchases } from "#lib/domain/locations"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * A list of cards in its sections (DD-192), drawn the one way Cards, Home's _Owed_ and _Ready to
	 * use_ share: by place, a section per location headed by its name, its count and whether it takes
	 * purchases; by account holder or limit group, a section per holder or group headed by it and its
	 * count; not grouped, one list under `head` (none: the grid alone, no section). Each section's items are a grid of
	 * tiles, one column on a phone and as many as fit from 900px; the page draws each tile (`tile`,
	 * told whether the item's place is left out of its section's head).
	 */
	interface Props {
		results: Sectioned<T>
		/** Each item's card: its id keys the tile. */
		cardOf: (item: T) => Card
		/** The stored locations: each place section's name, and whether it takes purchases. */
		locations: LocationRecord[]
		/** The line over a list that is not grouped. */
		head?: string | undefined
		/** One tile; `unplaced` when no section head names its place. */
		tile: Snippet<[item: T, unplaced: boolean]>
	}

	const { results, cardOf, locations, head, tile }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const cardsCount = (count: number) =>
		count === 1 ? tr("cards.page.count.one") : tr("cards.page.count.many", { count })

	/** A section's heading: its place, holder or limit group, and what is said after the count. */
	const sectionHead = (section: CardSection<T>): { name: string; extra: string } => {
		void lang
		if (section.kind === "place") {
			const takes = takesPurchases(locations, section.location)
			return {
				name: nameOfLocation(locations, section.location),
				extra: takes ? ` · ${t("cards.page.takesPurchases")}` : "",
			}
		}
		if (section.kind === "holder") return { name: section.owner ?? t("group.noHolder"), extra: "" }
		return { name: section.group?.name ?? t("cards.filter.ungrouped"), extra: "" }
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet tiles(items: T[], unplaced: boolean)}
	<div class="tiles">
		{#each items as item (cardOf(item).id)}
			{@render tile(item, unplaced)}
		{/each}
	</div>
{/snippet}

{#each results.sections ?? [] as section (section.key)}
	{@const name = sectionHead(section)}
	<section
		class="card-section"
		data-section={section.key}
		data-location={section.kind === "place" ? section.location : undefined}>
		<h2 class="place">
			<b>{name.name}</b>
			<small>{cardsCount(section.cards.length)}{name.extra}</small>
		</h2>
		{@render tiles(section.cards, section.kind !== "place")}
	</section>
{/each}
{#if results.flat && results.flat.length > 0}
	{#if head}
		<section class="card-section">
			<p class="result-head">{head}</p>
			{@render tiles(results.flat, true)}
		</section>
	{:else}
		{@render tiles(results.flat, true)}
	{/if}
{/if}

<style>
	.card-section {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
	}

	/* The tiles' grid: one column on a phone, as many as fit from 900px. */
	.tiles {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-2);
	}

	@media (min-width: 900px) {
		.tiles {
			grid-template-columns: repeat(auto-fill, minmax(var(--cc-tile-min), 1fr));
		}
	}

	/* Two classes, to outrank app.css's `.page h2` and `.page small`. */
	.card-section .place {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--cc-space-2);
		margin: 0;
		font-size: var(--cc-text-md);
		font-weight: 400;
	}

	.card-section .place small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.card-section .result-head {
		margin: 0;
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}
</style>
