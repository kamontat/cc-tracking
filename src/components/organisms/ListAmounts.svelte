<script lang="ts">
	import type { Snippet } from "svelte"
	import type { AmountWarning, DraftLine } from "#lib/domain/amount-warnings"
	import type { GroupRoom } from "#lib/domain/room"
	import type { Card, CardLedger, CardPayment, LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount, untrack } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import { datePassed, lineWarnings } from "#lib/domain/amount-warnings"
	import { displayDate, isValidDate } from "#lib/domain/date"
	import { draftLines, lineAmount, roomAfter } from "#lib/domain/list-entry"
	import { formatAmount, formatAmountInput } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, cardName, groupColor } from "#lib/ui/card-label"
	import { countWords } from "#lib/ui/list-share"

	/**
	 * Step 2 of a purchase list: a date and, per card, one or more orders, each an amount and an
	 * optional note; each card is warned about what the bank may do with its orders together. The warnings inform and never block; only text
	 * that is not money does. Every change calls `onentrychange` with the date and what was typed;
	 * Review calls `onreview`; *Save as draft* calls `ondraft`, which needs no amount at all, only
	 * no text that is not money (DD-187). The `side` snippet takes the page's own actions, after
	 * them (a draft's Delete draft).
	 */
	interface Props {
		/** The list's cards, in order. */
		cards: Card[]
		/** Every card, so a planned payment on a group-mate not on the list still counts. */
		allCards: Card[]
		/** The stored limit groups, in order: a card's chip takes its group's colour. */
		groups: LimitGroup[]
		/** Planned payments (`plannedOf`). */
		planned: CardPayment[]
		/** Ready cards not on the list, offered by Add another card. */
		candidates: Card[]
		rooms: Map<string, GroupRoom>
		ledgers: Map<string, CardLedger>
		today: PlainDate
		/** The date's first value; a new value replaces what was picked. */
		date: PlainDate
		/** The amounts' first texts, by card, one per order; a card's new value replaces what was typed. */
		entries: Record<string, string[]>
		/** The notes' first texts, by card, one per order; a card's new value replaces what was typed. */
		notes: Record<string, string[]>
		onentrychange: (detail: {
			date: PlainDate
			entries: Record<string, string[]>
			notes: Record<string, string[]>
		}) => void
		onreview: (detail: { date: PlainDate }) => void
		/** *Save as draft*, shown only when given. */
		ondraft?: (detail: { date: PlainDate }) => void
		onremove: (cardId: string) => void
		onadd: (cardId: string) => void
		side?: Snippet
	}

	const {
		cards,
		allCards,
		groups,
		planned,
		candidates,
		rooms,
		ledgers,
		today,
		date,
		entries,
		notes,
		onentrychange,
		onreview,
		ondraft,
		onremove,
		onadd,
		side,
	}: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	// What the reader typed lives here, so a parent re-render keeps it.
	let typed = $state<Record<string, string[]>>(untrack(() => ({ ...entries })))
	let typedNotes = $state<Record<string, string[]>>(untrack(() => ({ ...notes })))
	let dateText = $state<string>(untrack(() => date))
	let picking = $state(false)

	/** The keys of `next` whose value differs from `seen`. */
	const changedKeys = (next: Record<string, string[]>, seen: Record<string, string[]>) => {
		const out: Record<string, string[]> = {}
		for (const [key, value] of Object.entries(next)) {
			if (seen[key]?.join("\n") !== value.join("\n") || seen[key]?.length !== value.length) out[key] = [...value]
		}
		return out
	}

	// Each prop refills its own field only when its value really changes: the page hands a fresh
	// copy of the same values after every reload, and that must keep what was typed.
	let seenEntries = untrack(() => ({ ...entries }))
	let seenNotes = untrack(() => ({ ...notes }))
	let seenDate = untrack(() => date)
	$effect.pre(() => {
		const next = entries
		untrack(() => {
			const changed = changedKeys(next, seenEntries)
			seenEntries = { ...next }
			if (Object.keys(changed).length > 0) typed = { ...typed, ...changed }
		})
	})
	$effect.pre(() => {
		const next = notes
		untrack(() => {
			const changed = changedKeys(next, seenNotes)
			seenNotes = { ...next }
			if (Object.keys(changed).length > 0) typedNotes = { ...typedNotes, ...changed }
		})
	})
	$effect.pre(() => {
		const next = date
		if (next === seenDate) return
		seenDate = next
		untrack(() => {
			dateText = next
		})
	})

	/** The purchase date; an emptied or impossible field reads as today. */
	const effectiveDate = $derived(isValidDate(dateText) ? dateText : today)

	const changed = () => {
		onentrychange({ date: effectiveDate, entries: { ...typed }, notes: { ...typedNotes } })
	}

	/** How many orders a card has: at least one, else as many as anything typed for it. */
	const orderCount = (cardId: string) => Math.max(1, typed[cardId]?.length ?? 0, typedNotes[cardId]?.length ?? 0)

	/** A card's texts, one per order, blanks filling in what was never typed. */
	const padded = (texts: string[] | undefined, count: number) =>
		Array.from({ length: count }, (_, i) => texts?.[i] ?? "")

	const setAmount = (cardId: string, order: number, text: string) => {
		const next = padded(typed[cardId], orderCount(cardId))
		next[order] = text
		typed = { ...typed, [cardId]: next }
		changed()
	}

	const setNote = (cardId: string, order: number, text: string) => {
		const next = padded(typedNotes[cardId], orderCount(cardId))
		next[order] = text
		typedNotes = { ...typedNotes, [cardId]: next }
		changed()
	}

	const addOrder = (cardId: string) => {
		const count = orderCount(cardId)
		typed = { ...typed, [cardId]: [...padded(typed[cardId], count), ""] }
		typedNotes = { ...typedNotes, [cardId]: [...padded(typedNotes[cardId], count), ""] }
		changed()
	}

	const removeOrder = (cardId: string, order: number) => {
		const count = orderCount(cardId)
		const without = (texts: string[] | undefined) => padded(texts, count).filter((_, i) => i !== order)
		typed = { ...typed, [cardId]: without(typed[cardId]) }
		typedNotes = { ...typedNotes, [cardId]: without(typedNotes[cardId]) }
		changed()
	}

	const setDate = (text: string) => {
		dateText = text
		changed()
	}

	const known = $derived(allCards.length > 0 ? allCards : cards)

	/** Cards' names for a notice, comma separated (the name form, UI-14). */
	const names = (ids: string[]) =>
		ids
			.map((id) =>
				cardName(
					id,
					known.find((c) => c.id === id),
				),
			)
			.join(", ")

	/** Each card's orders in satang, null for one whose text is not money. */
	const amounts = $derived.by(() => {
		const out: Record<string, (number | null)[]> = {}
		for (const card of cards) out[card.id] = padded(typed[card.id], orderCount(card.id)).map(lineAmount)
		return out
	})

	const sum = (orders: (number | null)[]) => orders.reduce<number>((n, a) => n + (a ?? 0), 0)

	// A card's line is all its orders together: the room and the warnings are the card's.
	const lines = $derived.by(() => {
		const money: Record<string, number> = {}
		for (const [id, orders] of Object.entries(amounts)) money[id] = sum(orders)
		return draftLines(cards, money, rooms, ledgers, planned, effectiveDate, known)
	})

	const passed = $derived(datePassed(effectiveDate, today))

	/**
	 * One entry per card: its line, warnings, which orders' text is not money, whether any is,
	 * and its room after.
	 */
	const views = $derived.by(() => {
		void lang
		return cards.map((card) => {
			const line = lines.find((l) => l.card.id === card.id)
			const warnings = line ? lineWarnings(line, lines, effectiveDate, today) : []
			const orders = (amounts[card.id] ?? [0]).map((amount) => amount === null)
			const bad = orders.some(Boolean)
			const after = line && !bad ? formatAmount(roomAfter(line, lines)) : tr("common.none")
			return { card, line, warnings, orders, bad, warn: bad || warnings.length > 0, after }
		})
	})

	const all = $derived(Object.values(amounts).flat())
	const total = $derived(sum(all))
	const canReview = $derived(all.some((a) => a !== null && a > 0) && all.every((a) => a !== null))
	const canDraft = $derived(cards.length > 0 && all.every((a) => a !== null))

	const warned = $derived(views.filter((v) => v.warn).length)
	const summary = $derived.by(() => {
		const parts: string[] = []
		if (warned === 1) parts.push(tr("purchaseList.warn.lines.one"))
		if (warned > 1) parts.push(tr("purchaseList.warn.lines.many", { count: warned }))
		if (passed) parts.push(tr("purchaseList.warn.datePassedShort"))
		return parts.join(" · ")
	})

	const countText = $derived.by(() => {
		void lang
		return countWords("purchaseList.total", { cards: cards.length, orders: all.length })
	})

	const shown = (day: PlainDate) => {
		void lang
		return displayDate(day, getLocale())
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet chip(card: Card)}
	<span class="mini" data-g={groupColor(card, groups) ?? undefined}>{card.last4}</span>
{/snippet}

<!-- The picker row's chip and name, with no whitespace between them, as the legacy drew it. -->
<!-- biome-ignore format: whitespace between the parts would print as a space in the row's text -->
{#snippet pickRow(card: Card)}{@render chip(card)}<span class="what"><b><span class="card-label">{cardLine(card.id, card, { short: true })}</span></b></span>{/snippet}

{#snippet note(card: Card, warning: AmountWarning, line: DraftLine)}
	{#if warning.kind === "over-room"}
		<p class="note" data-warning="over-room">
			<span>{tr("purchaseList.warn.overRoom", { over: formatAmount(warning.over) })}</span>
			{#if warning.held > 0}
				<span>
					{tr("purchaseList.warn.held", { room: formatAmount(warning.room), held: formatAmount(warning.held) })}
				</span>
			{/if}
			{#if warning.plannedBefore > 0}
				<span data-part="planned">
					{tr("purchaseList.warn.planned", { amount: formatAmount(warning.plannedBefore) })}
				</span>
			{/if}
			<!-- With several orders it is not clear which one to lower, so it is left to the reader. -->
			{#if warning.room > 0 && orderCount(card.id) === 1}
				<button
					type="button"
					data-variant="quiet"
					data-action="lower"
					onclick={() => setAmount(card.id, 0, formatAmountInput(warning.room))}>
					{tr("purchaseList.warn.lowerTo", { room: formatAmount(warning.room) })}
				</button>
			{/if}
		</p>
	{:else if warning.kind === "shared-limit"}
		<p class="note" data-warning="shared-limit">
			{tr("purchaseList.warn.shared", {
				cards: names(warning.cardIds),
				group: line.room.group.name,
				over: formatAmount(warning.over),
				room: formatAmount(line.room.room),
			})}
		</p>
	{:else if warning.kind === "overdue-bill"}
		<p class="note" data-warning="overdue-bill">
			<span>
				{tr("purchaseList.warn.overdue", {
					card: cardName(card.id, card),
					date: shown(warning.dueDate),
					remaining: formatAmount(warning.remaining),
				})}
			</span>
			<a data-action="see-card" href={`/card?id=${encodeURIComponent(card.id)}`}>{tr("purchaseList.warn.seeCard")}</a>
		</p>
	{:else if warning.kind === "close-date"}
		<p class="note" data-warning="close-date">
			{tr("purchaseList.warn.closeDate", { card: cardName(card.id, card), date: shown(warning.closeDate) })}
		</p>
	{/if}
{/snippet}

<div class="list-layout">
	<div class="list-layout__main">
		{#if cards.length === 0}
			<p class="empty">{tr("purchaseList.noCards")}</p>
		{:else}
			<div class="lines">
				{#each views as view (view.card.id)}
					{@const card = view.card}
					{@const many = view.orders.length > 1}
					<section class="line" data-card={card.id} data-warn={view.warn ? "" : undefined}>
						<div class="top" row>
							<b>
								<span class="card-panel">
									{@render chip(card)}
									<span class="card-label">{cardLine(card.id, card, { short: true })}</span>
								</span>
							</b>
							<button type="button" data-variant="quiet" data-action="remove" onclick={() => onremove(card.id)}>
								{tr("purchaseList.remove")}
							</button>
						</div>
						{#each view.orders as bad, order (order)}
							{@const named = { card: cardName(card.id, card), n: order + 1 }}
							<div class="order" data-order={order}>
								{#if many}
									<div class="order-head" row>
										<span>{tr("purchaseList.order", { n: order + 1 })}</span>
										<button
											type="button"
											data-variant="quiet"
											data-action="remove-order"
											aria-label={tr("purchaseList.removeOrderFor", named)}
											onclick={() => removeOrder(card.id, order)}>
											<SvgIcon name="close" />
										</button>
									</div>
								{/if}
								<label class="bigin">
									<span>฿</span>
									<input
										inputmode="decimal"
										data-field="amount"
										placeholder="0"
										aria-label={many ? tr("purchaseList.amountForOrder", named) : tr("purchaseList.amountFor", named)}
										value={typed[card.id]?.[order] ?? ""}
										oninput={(e) => setAmount(card.id, order, e.currentTarget.value)}>
								</label>
								{#if bad}
									<p class="error">{tr("quickAdd.error.badAmount")}</p>
								{/if}
								<label class="line-note">
									{tr("purchaseList.noteLabel")}
									<input
										data-field="note"
										placeholder={tr("purchaseList.notePlaceholder")}
										aria-label={many ? tr("purchaseList.noteForOrder", named) : tr("purchaseList.noteFor", named)}
										value={typedNotes[card.id]?.[order] ?? ""}
										oninput={(e) => setNote(card.id, order, e.currentTarget.value)}>
								</label>
							</div>
						{/each}
						<button type="button" data-variant="quiet" data-action="add-order" onclick={() => addOrder(card.id)}>
							+ {tr("purchaseList.addOrder")}
						</button>
						<div class="after" row>
							<span>{tr("purchaseList.roomAfter")}</span>
							<b>{view.after}</b>
						</div>
						{#if view.line}
							{#each view.warnings as warning, i (i)}
								{@render note(card, warning, view.line)}
							{/each}
						{/if}
					</section>
				{/each}
			</div>
		{/if}
		<button
			type="button"
			data-variant="quiet"
			data-action="add-card"
			aria-expanded={picking ? "true" : "false"}
			onclick={() => {
				picking = !picking
			}}>
			+ {tr("purchaseList.addCard")}
		</button>
		{#if picking}
			<div class="picker panel">
				{#each candidates as card (card.id)}
					<button type="button" class="crow" data-card={card.id} onclick={() => onadd(card.id)}>
						{@render pickRow(card)}
					</button>
				{/each}
			</div>
		{/if}
	</div>
	<div class="list-layout__side">
		<div class="when" data-place="start">
			<label>
				{tr("purchaseList.date")}
				<input type="date" data-field="date" value={dateText} oninput={(e) => setDate(e.currentTarget.value)}>
			</label>
			{#if passed}
				<div class="note" data-warning="date-passed">
					<span>{tr("purchaseList.warn.datePassed")}</span>
					<button type="button" data-variant="quiet" data-action="to-today" onclick={() => setDate(today)}>
						{tr("purchaseList.warn.toToday")}
					</button>
				</div>
			{/if}
		</div>
		<div class="action-bar" row>
			{#if summary}
				<span class="summary warned">{summary}</span>
			{:else}
				<span class="summary">{countText}</span>
			{/if}
			<b class="total">{formatAmount(total)}</b>
			<button
				type="button"
				data-action="review"
				disabled={!canReview}
				onclick={() => onreview({ date: effectiveDate })}>
				{tr("purchaseList.review")}
				›
			</button>
		</div>
		{#if ondraft}
			<button
				type="button"
				data-variant="quiet"
				data-action="save-draft"
				disabled={!canDraft}
				onclick={() => ondraft({ date: effectiveDate })}>
				{tr("purchaseList.saveDraft")}
			</button>
		{/if}
		{@render side?.()}
	</div>
</div>

<style>
	/* The layout, the side panel and the bar are app.css's `.list-layout` and `.action-bar`; the
	   card chip is its `.card-panel` and `.mini`. What follows is what listLayout, rowPanel and
	   lineCards add on top for this step. */

	/* On a phone the step keeps listLayout's tighter gap; app.css's wider one is the review's and
	   the saved list's. From 900px both share app.css's grid gap. */
	@media (max-width: 899px) {
		.list-layout {
			gap: var(--cc-space-4);
		}
	}
	.lines {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		gap: var(--cc-space-4);
	}

	/* Each line its own panel: a card list (lineCards). */
	/* One track that shrinks to the card: a Thai warning's long unspaced runs would otherwise
	   widen it past a phone's edge. */
	.line {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-3);
		padding: var(--cc-space-4);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	/* The amber outline joins the warning text below it; never the only signal. */
	.line[data-warn] {
		border-color: var(--cc-warning);
		box-shadow: 0 0 0 var(--cc-border-width) var(--cc-warning);
	}

	/* One row: the card's label at the start, a small Remove at the end. */
	.top {
		align-items: center;
		gap: var(--cc-space-3);
	}

	.top b {
		flex: 1;
		min-inline-size: 0;
	}

	.top button[data-action="remove"] {
		flex: none;
		align-self: center;
		padding: var(--cc-space-1) var(--cc-space-2);
		font-size: var(--cc-text-xs);
	}

	.line .bigin {
		flex-direction: row;
		align-items: baseline;
		gap: var(--cc-space-2);
		padding: var(--cc-space-1) var(--cc-space-4);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.bigin span {
		font-size: var(--cc-text-lg);
		color: var(--cc-text-muted);
	}

	.line .bigin input {
		padding: var(--cc-space-1) 0;
		font-size: var(--cc-text-2xl);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		background: transparent;
		border: none;
	}

	/* An order: its amount and note, a line between it and the next. */
	.order {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-3);
	}

	.order + .order {
		padding-block-start: var(--cc-space-3);
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	.order-head {
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-3);
		font-size: var(--cc-text-sm);
		font-weight: 600;
		color: var(--cc-text-muted);
	}

	button[data-action="add-order"] {
		padding: var(--cc-space-1) var(--cc-space-2);
		font-size: var(--cc-text-xs);
	}

	/* A small × with no word, so it never reads as a second Remove beside the card's own. */
	.order-head button {
		display: inline-grid;
		place-items: center;
		padding: var(--cc-space-1);
		line-height: 0;
		border-radius: var(--cc-radius-pill);
	}

	.order-head button :global(.icon) {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	button[data-action="add-order"] {
		justify-self: start;
	}

	.after {
		justify-content: space-between;
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.error {
		font-size: var(--cc-text-sm);
		color: var(--cc-danger);
	}

	.line .line-note {
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.line .line-note input {
		min-inline-size: 0;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
	}

	.list-layout .note {
		display: grid;
		gap: var(--cc-space-2);
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		color: var(--cc-text);
		background: var(--cc-warning-surface);
		border-radius: var(--cc-radius-sm);
	}

	.note > span {
		display: block;
	}

	.empty {
		color: var(--cc-text-muted);
	}

	.when {
		gap: var(--cc-space-3);
	}

	/* The picker: one row panel (rowPanel's `.panel` and `.crow`). */
	.picker {
		padding: 0 var(--cc-space-4);
		overflow: clip;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.picker button.crow {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		align-self: stretch;
		gap: var(--cc-space-1) var(--cc-space-3);
		padding: var(--cc-space-3) 0;
		font-size: var(--cc-text-md);
		font-weight: 400;
		line-height: var(--cc-leading);
		white-space: normal;
		text-align: start;
		color: var(--cc-text);
		cursor: pointer;
		background: transparent;
		border: 0;
		border-radius: 0;
	}

	/* After the reset above, so the line between rows holds. */
	.picker > button.crow + button.crow {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	/* Hover is a quiet ground carried across the panel's side padding (DD-105, DD-109). */
	.picker button.crow:hover {
		background: var(--cc-surface-sunken);
		box-shadow:
			calc(var(--cc-space-4) * -1) 0 0 var(--cc-surface-sunken),
			var(--cc-space-4) 0 0 var(--cc-surface-sunken);
	}

	.picker button.crow:focus-visible {
		box-shadow: var(--cc-focus-ring);
	}

	.what {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-inline-size: 0;
		line-height: 1.35;
	}

	.what b {
		font-weight: 650;
	}

	.action-bar button {
		align-self: center;
		white-space: nowrap;
	}

	.action-bar button:disabled,
	button[data-action="save-draft"]:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.summary {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.summary.warned {
		font-weight: 600;
		color: var(--cc-warning);
	}

	.total {
		font-size: var(--cc-text-lg);
		font-variant-numeric: tabular-nums;
	}

	@media (min-width: 900px) {
		/* In the side panel the bar is a plain column, Review filling its width. */
		.list-layout__side .action-bar {
			position: static;
			flex-direction: column;
			align-items: stretch;
			gap: var(--cc-space-3);
			padding: 0;
			background: none;
			border: 0;
			box-shadow: none;
		}

		.list-layout__side .action-bar button {
			align-self: stretch;
			text-align: center;
		}
	}

	/* Two line cards side by side once the main column is wide enough for both. */
	@media (min-width: 1200px) {
		.lines {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
