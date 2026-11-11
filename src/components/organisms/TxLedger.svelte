<script lang="ts" module>
	export type { Upcoming } from "#lib/ui/ledger-drawer"
</script>

<script lang="ts">
	import type { Card, CardLedger, CardPayment, LimitGroup, PlainDate, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Drawer, LedgerSection, Upcoming } from "#lib/ui/ledger-drawer"

	import { onMount, untrack } from "svelte"

	import ActionRow from "#components/molecules/ActionRow.svelte"
	import TwoStepButtons from "#components/molecules/TwoStepButtons.svelte"
	import { displayDate, headerDate } from "#lib/domain/date"
	import { formatAmount, MINUS } from "#lib/domain/money"
	import { listTotal } from "#lib/domain/purchase-list"
	import { entriesTotal, entryAmount, entryDate, listIdOf, type TxEntry } from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, groupColor } from "#lib/ui/card-label"
	import { entryId, paymentDrawer, planId, purchaseDrawer, shownGroups } from "#lib/ui/ledger-drawer"
	import { listPageAddress } from "#lib/ui/list-address"
	import { OpenRows } from "#lib/ui/open-row.svelte"
	import { listParts, plannedSay, plannedText, say, sentWords, waitingText } from "#lib/ui/row-text"
	import { TwoStep } from "#lib/ui/two-step.svelte"
	import { LEDGER_PAGE } from "#lib/ui/tx-query"

	/**
	 * The ledger: purchases and paid payments, grouped under day or card headings (`groups`, DD-192)
	 * or flat (`entries`), and the *Upcoming* section above it. Each section (or the flat list) is one panel of
	 * rows. Every row is the shared opening row (`ActionRow`): its head is one button and it opens
	 * in place, one row at a time across Upcoming and every day, to a drawer of one sentence and
	 * its buttons (DD-165). A purchase opens to its statement's billing cycle line and what that
	 * statement holds, with *Open card* and, when from a list, *Open list*; a paid payment to how
	 * much reached each statement and any credit kept, with a two-step *Delete* (DD-77). In
	 * Upcoming a waiting list opens to its lines, *Record reply* and a two-step *Confirm*
	 * (`onconfirmlist`); a planned payment to its date, *Paid* (`onmarkpaid`) and a two-step
	 * *Delete* (`ondeletepayment`). Each second step swaps the buttons in place (UI-09) and focus
	 * follows the swap; a swap ends when its row closes. Only the first `limit` rows show; a quiet
	 * *Show more* under them asks for more (`onshowmore`). The results line still counts every
	 * entry.
	 */
	interface Props {
		/** The rows in sections, by day or by card (`groupEntries`); null draws them flat (`entries`). */
		groups?: LedgerSection[] | null
		entries?: TxEntry[]
		lists?: PurchaseList[]
		/** Each card's ledger, by card id: a purchase's statement and where a payment went. */
		ledgers?: Map<string, CardLedger>
		/** The stored limit groups, in order: a row's chip takes its group's colour. */
		limitGroups?: LimitGroup[]
		upcoming?: Upcoming | null
		today?: PlainDate
		filtered?: boolean
		/** How many rows show; the page raises it by `LEDGER_PAGE` on `onshowmore`. */
		limit?: number
		/** *Paid* on a planned payment. */
		onmarkpaid?: ((payment: CardPayment) => void) | undefined
		/** The second *Confirm* on a waiting list. */
		onconfirmlist?: ((list: PurchaseList) => void) | undefined
		/** The second *Delete* on a planned or paid payment. */
		ondeletepayment?: ((payment: CardPayment) => void) | undefined
		/** *Show more* under the rows. */
		onshowmore?: (() => void) | undefined
	}

	const {
		groups = null,
		entries = [],
		lists = [],
		ledgers = new Map(),
		limitGroups = [],
		upcoming = null,
		today = "",
		filtered = false,
		limit = LEDGER_PAGE,
		onmarkpaid,
		onconfirmlist,
		ondeletepayment,
		onshowmore,
	}: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let root = $state<HTMLElement | undefined>()
	/** The two-step *Delete* and *Confirm* swaps. */
	const steps = new TwoStep(() => root)
	/** The one open row, Upcoming and ledger alike; a swap ends when its row closes. */
	const rows = new OpenRows(
		"cc-tx-ledger",
		() => root,
		() => steps.reset(),
	)

	const all = $derived(groups ? groups.flatMap((g) => g.entries) : entries)
	const days = $derived(groups ? shownGroups(groups, limit) : null)
	const flat = $derived(groups ? [] : entries.slice(0, limit))
	const hasUpcoming = $derived(!!upcoming && (upcoming.lists.length > 0 || upcoming.planned.length > 0))

	/** Every row drawn now, by its open-row id. */
	const drawnIds = $derived([
		...(upcoming?.lists.map((l) => `list:${l.id}`) ?? []),
		...(upcoming?.planned.map(({ payment }) => planId(payment)) ?? []),
		...(days ? days.flatMap((g) => g.entries) : flat).map(entryId),
	])

	// Before the repaint: forget an open row that is gone, and hand on its focus.
	$effect.pre(() => {
		const ids = drawnIds
		untrack(() => rows.prune(ids))
	})

	const signed = (entry: TxEntry) => `${entry.kind === "payment" ? "+" : MINUS}${formatAmount(entryAmount(entry))}`

	const listOf = (entry: TxEntry): PurchaseList | undefined => {
		if (entry.kind !== "purchase") return undefined
		const listId = listIdOf(entry.purchase.id)
		return listId ? lists.find((l) => l.id === listId) : undefined
	}

	/** A ledger row's sub line: its note, the list it came from, and (flat) its date. */
	const subLine = (entry: TxEntry, showDate: boolean): string => {
		const parts: string[] = []
		const note = entry.kind === "purchase" ? entry.purchase.note : entry.payment.note
		if (note) parts.push(note)
		const list = listOf(entry)
		if (list) parts.push(tr("tx.fromList", { date: headerDate(list.date, lang, false) }))
		if (showDate) parts.push(displayDate(entryDate(entry), lang))
		return parts.join(" · ")
	}

	/** What an opened ledger row shows, re-read when the language changes. */
	const drawerOf = (entry: TxEntry): Drawer => {
		void lang
		return entry.kind === "purchase" ? purchaseDrawer(entry, ledgers, today) : paymentDrawer(entry.payment, ledgers)
	}

	const waitingOf = (list: PurchaseList, cards: Card[]) => {
		void lang
		return {
			text: waitingText(list, cards, limitGroups),
			parts: listParts(list, cards),
			say: say("row.say.sent", { date: sentWords(list) }),
		}
	}

	const plannedOf = (payment: CardPayment, card: Card | undefined) => {
		void lang
		return { text: plannedText(payment, card, limitGroups, today), say: plannedSay(payment) }
	}

	/** A section's heading: its day (*Today · …* for today), or its card in the line form. */
	const heading = (section: LedgerSection) => {
		if (section.kind === "card") {
			void lang
			return cardLine(section.cardId, section.card)
		}
		const words = headerDate(section.date, lang, false)
		return section.date === today ? tr("tx.today", { date: words }) : words
	}

	const resultHead = $derived.by(() => {
		const total = entriesTotal(all)
		const sign = total < 0 ? MINUS : "+"
		return tr(all.length === 1 ? "tx.results.one" : "tx.results.many", {
			count: all.length,
			total: `${sign}${formatAmount(Math.abs(total))}`,
		})
	})

	/** *Show 50 more · N left*, or *Show N more* when fewer than a page are left. */
	const left = $derived(all.length - limit)
	const moreLabel = $derived(
		left > LEDGER_PAGE
			? tr("tx.showMore.page", { page: LEDGER_PAGE, count: left })
			: tr("tx.showMore.rest", { count: left }),
	)

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet ledgerRow(entry: TxEntry, showDate: boolean)}
	{@const id = entry.kind === "purchase" ? entry.purchase.cardId : entry.payment.cardId}
	{@const rowId = entryId(entry)}
	{@const list = listOf(entry)}
	{@const sub = subLine(entry, showDate)}
	{@const drawer = drawerOf(entry)}
	<!-- The signed, coloured amount says purchase or payment (UI-07: the sign is the non-colour
	     signal), so the title is the card alone. -->
	<ActionRow
		kind={entry.kind}
		id={rowId}
		detailsId={rows.detailsId(rowId)}
		expanded={rows.isOpen(rowId)}
		ontoggle={() => rows.toggle(rowId)}
		amount={{ text: signed(entry), tone: entry.kind === "purchase" ? "out" : "in" }}
		cycle={drawer.cycle}
		parts={drawer.parts}
		say={drawer.say}>
		{#snippet lead()}
			{#if entry.card}
				<span class="mini" data-g={groupColor(entry.card, limitGroups) ?? undefined}>{entry.card.last4}</span>
			{:else}
				<span class="mini" aria-hidden="true"></span>
			{/if}
		{/snippet}
		{#snippet title()}
			<span class="card-label">{cardLine(id, entry.card, { short: true })}</span>
		{/snippet}
		{#snippet subtitle()}
			{#if sub}
				<span>{sub}</span>
			{/if}
			{#if entry.card?.archived}
				<span class="tag archived">{tr("cards.archived")}</span>
			{/if}
		{/snippet}
		{#snippet actions()}
			{#if entry.kind === "purchase"}
				<a
					class="btn"
					data-variant="quiet"
					data-action="open-card"
					href={`/card?id=${encodeURIComponent(entry.purchase.cardId)}`}
					>{tr("row.openCard")}</a
				>
				{#if list}
					<a
						class="btn"
						data-variant="quiet"
						data-action="open-list"
						href={`/list/view?id=${encodeURIComponent(list.id)}`}
						>{tr("row.openList")}</a
					>
				{/if}
			{:else}
				{@const payment = entry.payment}
				<TwoStepButtons {steps} kind="paid" {payment} card={entry.card} onremove={() => ondeletepayment?.(payment)} />
			{/if}
		{/snippet}
	</ActionRow>
{/snippet}

<div class="ledger" bind:this={root}>
	{#if upcoming && hasUpcoming}
		{@const up = upcoming}
		<section class="upcoming">
			<div class="sec-head">
				<h2 class="sec-title" tabindex="-1" data-refocus="upcoming">{tr("tx.upcoming")}</h2>
			</div>
			<div class="row-panel panel">
				{#each up.lists as list (list.id)}
					{@const rowId = `list:${list.id}`}
					{@const words = waitingOf(list, up.cards)}
					<ActionRow
						kind={words.text.kind}
						title={words.text.title}
						subtitle={words.text.subtitle}
						id={rowId}
						detailsId={rows.detailsId(rowId)}
						expanded={rows.isOpen(rowId)}
						ontoggle={() => rows.toggle(rowId)}
						amount={{ text: `${MINUS}${formatAmount(listTotal(list))}`, tone: "muted" }}
						parts={words.parts}
						say={words.say}>
						{#snippet actions()}
							<a class="btn" data-action="record-reply" href={listPageAddress(list)}>{tr("row.recordReply")}</a>
							<TwoStepButtons {steps} kind="list" {list} onconfirm={() => onconfirmlist?.(list)} />
						{/snippet}
					</ActionRow>
				{/each}
				{#each up.planned as { payment, card } (planId(payment))}
					{@const rowId = planId(payment)}
					{@const words = plannedOf(payment, card)}
					<!-- The subtitle has no note, so the sentence carries it. -->
					<ActionRow
						kind={words.text.kind}
						title={words.text.title}
						subtitle={words.text.subtitle}
						id={rowId}
						detailsId={rows.detailsId(rowId)}
						expanded={rows.isOpen(rowId)}
						ontoggle={() => rows.toggle(rowId)}
						amount={{ text: `+${formatAmount(payment.amount)}`, tone: "in" }}
						say={words.say}>
						{#snippet actions()}
							<TwoStepButtons
								{steps}
								kind="plan"
								{payment}
								{card}
								onpaid={() => onmarkpaid?.(payment)}
								onremove={() => ondeletepayment?.(payment)} />
						{/snippet}
					</ActionRow>
				{/each}
			</div>
		</section>
	{/if}
	{#if filtered}
		<p class="result-head">{resultHead}</p>
	{/if}
	{#if all.length === 0}
		<p class="empty" tabindex="-1" data-refocus="ledger">{tr(filtered ? "tx.noResults" : "tx.empty")}</p>
	{:else if days}
		{#each days as group (group.key)}
			<section class={group.kind} data-section={group.key}>
				<h3 class="sec-title" tabindex="-1" data-refocus={group.key}>{heading(group)}</h3>
				<div class="row-panel panel">
					{#each group.entries as entry (entryId(entry))}
						{@render ledgerRow(entry, group.kind === "card")}
					{/each}
				</div>
			</section>
		{/each}
	{:else}
		<div class="row-panel panel">
			{#each flat as entry (entryId(entry))}
				{@render ledgerRow(entry, true)}
			{/each}
		</div>
	{/if}
	{#if left > 0}
		<button type="button" class="more" data-variant="quiet" data-action="show-more" onclick={() => onshowmore?.()}>
			{moreLabel}
		</button>
	{/if}
</div>

<style>
	.ledger {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
	}

	.sec-head {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cc-space-2);
	}

	/* Two classes, to outrank app.css's `.page h2`. */
	.ledger .sec-title {
		font-size: var(--cc-text-xs);
		font-weight: 650;
		letter-spacing: var(--cc-tracking-caps);
		text-transform: uppercase;
		color: var(--cc-text-muted);
	}

	/* The row panel (app.css `.row-panel`) clips the rows' hover ground at its rounded corners. */
	.panel {
		display: flex;
		flex-direction: column;
		overflow: clip;
	}

	.result-head {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.ledger .more {
		align-self: center;
	}

	.empty {
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
		text-align: center;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	/* A pill with a dot that carries a word as well as a colour: a row's *Archived*. */
	.tag {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		align-self: flex-start;
		gap: calc(var(--cc-space-1) * 1.25);
		padding: 0 var(--cc-space-2);
		font-size: var(--cc-text-xs);
		font-weight: 650;
		line-height: 1.6;
		white-space: nowrap;
		color: var(--cc-text-muted);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-pill);
	}

	.tag::before {
		content: "";
		inline-size: calc(var(--cc-space-1) * 1.5);
		block-size: calc(var(--cc-space-1) * 1.5);
		background: currentColor;
		border-radius: var(--cc-radius-pill);
	}
</style>
