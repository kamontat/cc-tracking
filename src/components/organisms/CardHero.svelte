<script lang="ts">
	import type { GroupRoom } from "#lib/domain/room"
	import type { Card, LedgerStatement, LimitGroup, LocationRecord, OwnerRecord, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { cardUsePct } from "#lib/domain/cards-view"
	import { closeDateOf, dueDateOf } from "#lib/domain/cycle"
	import { displayDate } from "#lib/domain/date"
	import { ledgerUrgency } from "#lib/domain/ledger"
	import { usageLevel } from "#lib/domain/limit"
	import { formatAmount } from "#lib/domain/money"
	import { cardOwnerOf, ownerName } from "#lib/domain/owner"
	import { openPeriod } from "#lib/domain/statement"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { groupColor } from "#lib/ui/card-label"

	/**
	 * The top of a card's page (prototype `vCard`): the hero on the group's pastel -- the group and
	 * its holder, the cards it is shared with, the room big, the limit, the bar, and the share used
	 * with the dates a purchase made today lands on -- then three stats: *Owed*, *Next bill* (the
	 * bad colour when overdue) and *Credit* when there is credit, else *Kept in*. Every figure
	 * arrives computed (`roomFor`, the card's ledger, `nextBill`); this only lays them out.
	 */
	interface Props {
		/** The card; null renders nothing. */
		card: Card | null
		/** Every stored card, to name the others on this card's group. */
		cards?: Card[]
		/** Every stored group, in order, for the group's pastel. */
		groups?: LimitGroup[]
		/** The stored owners, to name a holder by its record (RD-30). */
		owners?: OwnerRecord[]
		/** The card's group room, from `roomFor`; null when it draws on no group. */
		room?: GroupRoom | null
		/** What this card alone still owes, from its ledger. */
		owed?: number
		/** Paid money the card's statements could not spend, from its ledger. */
		credit?: number
		/** The oldest closed statement still owing, from `nextBill`. */
		next?: LedgerStatement | null
		today?: PlainDate
		/** The stored locations, which name the place the card is kept at. */
		locations?: LocationRecord[]
	}

	const {
		card,
		cards = [],
		groups = [],
		owners = [],
		room = null,
		owed = 0,
		credit = 0,
		next = null,
		today = "",
		locations = [],
	}: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const tone = $derived(card ? groupColor(card, groups) : null)

	/** The hero's figures, or null for a card on no stored group: invalid data, left out (RD-27). */
	const hero = $derived.by(() => {
		if (!card || !room) return null
		const { group } = room
		const id = cardOwnerOf(card, group)
		const holder = id ? ownerName(id, owners) : ""
		const others = cards.filter((c) => c.limitGroupId === group.id && c.id !== card.id).map((c) => c.id)
		const who = [group.name, holder, others.length > 0 ? tr("card.hero.shared", { cards: others.join(", ") }) : ""]
			.filter(Boolean)
			.join(" · ")
		const pct = cardUsePct(room) ?? 0
		const period = openPeriod(card, today)
		const locale = lang
		return {
			who,
			pct,
			big: formatAmount(room.room),
			of: tr("card.hero.roomOf", { limit: formatAmount(group.limit) }),
			level: usageLevel(room.used + room.held, group.limit),
			used: tr("card.hero.used", {
				pct,
				close: displayDate(closeDateOf(card.cycle, period), locale),
				due: displayDate(dueDateOf(card.cycle, period), locale),
			}),
		}
	})

	const overdue = $derived(next !== null && ledgerUrgency(next, today) === "overdue")

	const keptIn = $derived.by(() => {
		void lang
		return card ? nameOfLocation(locations, card.location) : ""
	})

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#if card}
	<div class="card-hero">
		{#if hero}
			<section class="hero" data-g={tone ?? undefined}>
				<span class="who">{hero.who}</span>
				<div class="figure">
					<span class="big" data-numeric>{hero.big}</span>
					<span class="of">{hero.of}</span>
				</div>
				<span class="bar" data-level={hero.level} aria-hidden="true">
					<span style:inline-size="{Math.min(100, hero.pct)}%"></span>
				</span>
				<span class="used">{hero.used}</span>
			</section>
		{/if}
		<div class="stats">
			<div class="stat">
				<small>{tr("card.stat.owed")}</small>
				<b data-numeric>{formatAmount(owed)}</b>
			</div>
			<div class="stat">
				<small>{tr("card.stat.next")}</small>
				<b data-numeric data-overdue={overdue ? "" : undefined}>{next ? formatAmount(next.remaining) : "—"}</b>
			</div>
			{#if credit > 0}
				<div class="stat">
					<small>{tr("card.stat.credit")}</small>
					<b data-numeric>{formatAmount(credit)}</b>
				</div>
			{:else}
				<div class="stat">
					<small>{tr("card.stat.keptIn")}</small>
					<b>{keptIn}</b>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/*
	 * Each selector carries the scope's class besides its own, so it outranks app.css's light-DOM
	 * `.page small` and `.page p` rules.
	 */
	.card-hero {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	.hero {
		display: grid;
		gap: var(--cc-space-3);
		padding: var(--cc-space-4);
		color: var(--cc-text);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.hero[data-g] {
		color: var(--g-fg);
		background: var(--g-bg);
		border-color: transparent;
	}

	.hero p {
		margin: 0;
	}

	.who,
	.used {
		font-size: var(--cc-text-xs);
	}

	.who {
		font-weight: 600;
	}

	.figure {
		display: flex;
		flex-direction: column;
	}

	/* The room is the page's one big figure, in ink so it reads first on any pastel. */
	.big {
		font-size: var(--cc-text-2xl);
		font-weight: var(--cc-hero-amount-weight);
		line-height: var(--cc-hero-amount-leading);
		letter-spacing: var(--cc-hero-amount-tracking);
		color: var(--cc-text);
		font-variant-numeric: tabular-nums;
	}

	.of {
		font-size: var(--cc-text-sm);
	}

	/* The bar in the group's own ink, its track a tint of the same. */
	.bar {
		display: block;
		block-size: calc(var(--cc-space-1) * 1.5);
		overflow: hidden;
		background: color-mix(in oklab, currentColor var(--cc-hero-track), transparent);
		border-radius: var(--cc-radius-pill);
	}

	.bar > span {
		display: block;
		block-size: 100%;
		background: currentColor;
		border-radius: var(--cc-radius-pill);
	}

	.bar[data-level="high"] > span {
		background: var(--cc-warning);
	}

	.bar[data-level="over"] > span {
		background: var(--cc-danger);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--cc-space-2);
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: calc(var(--cc-space-1) * 0.75);
		min-inline-size: 0;
		padding: var(--cc-space-2) var(--cc-space-3);
		line-height: 1.3;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	.stat small {
		font-size: var(--cc-text-xs);
		font-weight: 600;
		color: var(--cc-text-muted);
		text-transform: uppercase;
		letter-spacing: var(--cc-tracking-caps);
	}

	.stat b {
		font-size: var(--cc-text-md);
		font-weight: 650;
		overflow-wrap: anywhere;
	}

	.stat b[data-overdue] {
		color: var(--cc-danger);
	}

	@media (max-width: 639px) {
		.stat {
			padding-inline: var(--cc-space-2);
		}

		.stat b {
			font-size: var(--cc-text-sm);
		}
	}

	@media (forced-colors: active) {
		.bar {
			border: var(--cc-border-width) solid;
		}

		.bar > span {
			background: CanvasText;
		}
	}
</style>
