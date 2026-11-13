<script lang="ts">
	import type { Snippet } from "svelte"
	import type { AmountWarning, DraftLine } from "#lib/domain/amount-warnings"
	import type { ReadyRow } from "#lib/domain/home"
	import type { GroupRoom } from "#lib/domain/room"
	import type { Card, CardLedger, CardPayment, LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { ListSheet } from "#lib/ui/list-address"

	import { onMount, tick, untrack } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import Sheet from "#components/molecules/Sheet.svelte"
	import UsageChart from "#components/molecules/UsageChart.svelte"
	import ListCardPicker from "#components/organisms/ListCardPicker.svelte"
	import { datePassed, lineWarnings } from "#lib/domain/amount-warnings"
	import { dayMonth, displayDate, isValidDate } from "#lib/domain/date"
	import { draftLines, lineAmount, roomAfter } from "#lib/domain/list-entry"
	import { formatAmount, formatAmountInput } from "#lib/domain/money"
	import { cardUsage } from "#lib/domain/usage"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, cardName, groupColor } from "#lib/ui/card-label"
	import { tileTone } from "#lib/ui/card-tile"
	import { countWords } from "#lib/ui/list-share"
	import { withRecord } from "#lib/ui/record-panel.svelte"

	/**
	 * Writing a purchase list (DD-195): the list first, one row per card with what its orders add
	 * up to, then *+ Add a card*. The add-a-card sheet (`sheet`) is the picker (every ready card
	 * with its last 12 statements) or one card: its figures and statement chart over its orders,
	 * each an amount and an optional note (DD-186), with the card's warnings. A card being added
	 * joins the list only on *Add to list* or *Add & pick another*; leaving the sheet first drops
	 * what was typed for it. A row opens its card's sheet again, to change it or take it off.
	 * The sheet lives in the page's address, so the page moves it: every change asks `onsheet`.
	 *
	 * The warnings inform and never block; only text that is not money does. Every change calls
	 * `onentrychange` with the date and what was typed; Review calls `onreview`; *Save as draft*
	 * calls `ondraft`, which needs no amount at all, only no text that is not money (DD-187). The
	 * `side` snippet takes the page's own actions, after them (a draft's Delete draft).
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
		/** Every ready card: the picker's tiles, and where a card being added finds its dates. */
		ready: ReadyRow[]
		/** Each ready card's room, the list's own cards among them. */
		rooms: Map<string, GroupRoom>
		ledgers: Map<string, CardLedger>
		today: PlainDate
		/** The date's first value; a new value replaces what was picked. */
		date: PlainDate
		/** The amounts' first texts, by card, one per order; a card's new value replaces what was typed. */
		entries: Record<string, string[]>
		/** The notes' first texts, by card, one per order; a card's new value replaces what was typed. */
		notes: Record<string, string[]>
		/** The open sheet: the picker, one card, or none. */
		sheet: ListSheet
		/** Asks the page to open, change or close the sheet. */
		onsheet: (next: ListSheet) => void
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
		ready,
		rooms,
		ledgers,
		today,
		date,
		entries,
		notes,
		sheet,
		onsheet,
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
	let sheetRef = $state<ReturnType<typeof Sheet> | undefined>()
	let stepRoot = $state<HTMLElement | undefined>()

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

	const addOrder = async (cardId: string) => {
		const count = orderCount(cardId)
		typed = { ...typed, [cardId]: [...padded(typed[cardId], count), ""] }
		typedNotes = { ...typedNotes, [cardId]: [...padded(typedNotes[cardId], count), ""] }
		changed()
		await tick()
		stepRoot?.querySelector<HTMLInputElement>(`[data-order="${count}"] [data-field="amount"]`)?.focus()
	}

	const removeOrder = (cardId: string, order: number) => {
		const count = orderCount(cardId)
		const without = (texts: string[] | undefined) => padded(texts, count).filter((_, i) => i !== order)
		typed = { ...typed, [cardId]: without(typed[cardId]) }
		typedNotes = { ...typedNotes, [cardId]: without(typedNotes[cardId]) }
		changed()
	}

	/** Forgets what was typed for a card: one that left the list, or was never added. */
	const forget = (cardId: string) => {
		if (!(cardId in typed) && !(cardId in typedNotes)) return
		const { [cardId]: _amounts, ...keptAmounts } = typed
		const { [cardId]: _notes, ...keptNotes } = typedNotes
		typed = keptAmounts
		typedNotes = keptNotes
		changed()
	}

	const setDate = (text: string) => {
		dateText = text
		changed()
	}

	const known = $derived(allCards.length > 0 ? allCards : cards)
	const readyById = $derived(new Map(ready.map((row) => [row.card.id, row])))

	/** Every ready card's last 12 statements, from its ledger, as of today. */
	const usage = $derived(
		new Map(ready.map((row) => [row.card.id, cardUsage(row.card, ledgers.get(row.card.id), today)])),
	)

	/** The sheet's card, on the list or being added; undefined for the picker or an unknown card. */
	const sheetCard = $derived.by(() => {
		if (sheet?.kind !== "card") return undefined
		const id = sheet.cardId
		return cards.find((c) => c.id === id) ?? readyById.get(id)?.card
	})
	const adding = $derived(sheetCard !== undefined && !cards.some((c) => c.id === sheetCard.id))

	// A card left in the sheet without being added takes what was typed for it with it.
	let lastPending: string | null = null
	$effect(() => {
		const pending = adding && sheetCard ? sheetCard.id : null
		untrack(() => {
			const left = lastPending
			lastPending = pending
			if (left && left !== pending && !cards.some((c) => c.id === left)) forget(left)
		})
	})

	// Opening a card puts the cursor in its first amount.
	$effect(() => {
		if (sheet?.kind !== "card") return
		void sheet.cardId
		void tick().then(() => stepRoot?.querySelector<HTMLInputElement>('[data-field="amount"]')?.focus())
	})

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

	/** The cards whose orders count: the list's, and a card being added while its sheet is open. */
	const counted = $derived(adding && sheetCard ? [...cards, sheetCard] : cards)

	/** Each card's orders in satang, null for one whose text is not money. */
	const amounts = $derived.by(() => {
		const out: Record<string, (number | null)[]> = {}
		for (const card of counted) out[card.id] = padded(typed[card.id], orderCount(card.id)).map(lineAmount)
		return out
	})

	const sum = (orders: (number | null)[]) => orders.reduce<number>((n, a) => n + (a ?? 0), 0)

	// A card's line is all its orders together: the room and the warnings are the card's.
	const linesOf = (of: Card[]) => {
		const money: Record<string, number> = {}
		for (const card of of) money[card.id] = sum(amounts[card.id] ?? [])
		return draftLines(of, money, rooms, ledgers, planned, effectiveDate, known)
	}
	const lines = $derived(linesOf(cards))
	// With a card being added, its sheet reads the list as if it were on it.
	const sheetLines = $derived(adding ? linesOf(counted) : lines)

	const passed = $derived(datePassed(effectiveDate, today))

	/**
	 * A card's line, warnings, which orders' text is not money, whether any is, what its orders
	 * add up to and its room after.
	 */
	const viewOf = (card: Card, among: DraftLine[]) => {
		void lang
		const line = among.find((l) => l.card.id === card.id)
		const warnings = line ? lineWarnings(line, among, effectiveDate, today) : []
		const orders = (amounts[card.id] ?? [0]).map((amount) => amount === null)
		const bad = orders.some(Boolean)
		const after = line && !bad ? formatAmount(roomAfter(line, among)) : tr("common.none")
		return {
			card,
			line,
			warnings,
			orders,
			bad,
			warn: bad || warnings.length > 0,
			after,
			total: sum(amounts[card.id] ?? []),
		}
	}

	const views = $derived(cards.map((card) => viewOf(card, lines)))
	const sheetView = $derived(sheetCard ? viewOf(sheetCard, sheetLines) : null)

	const all = $derived(cards.flatMap((card) => amounts[card.id] ?? [0]))
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

	/** A row's muted line: its orders, then what is wrong or its room after, then its notes. */
	const detail = (view: ReturnType<typeof viewOf>) => {
		const parts: string[] = []
		if (view.orders.length > 1) parts.push(tr("purchaseList.row.orders", { count: view.orders.length }))
		if (view.bad) parts.push(tr("purchaseList.row.bad"))
		else if (view.warnings.length === 1) parts.push(tr("purchaseList.row.warn.one"))
		else if (view.warnings.length > 1) parts.push(tr("purchaseList.row.warn.many", { count: view.warnings.length }))
		else parts.push(tr("purchaseList.row.after", { amount: view.after }))
		const noted = padded(typedNotes[view.card.id], view.orders.length)
			.map((n) => n.trim())
			.filter(Boolean)
		if (noted.length > 0) parts.push(noted.join(", "))
		return parts.join(" · ")
	}

	const facts = (cardId: string) => {
		void lang
		const row = readyById.get(cardId)
		return row ? tr("cards.page.dates", { close: dayMonth(row.closeDate, lang), due: dayMonth(row.dueDate, lang) }) : ""
	}

	const shown = (day: PlainDate) => {
		void lang
		return displayDate(day, getLocale())
	}

	/** The cards on the list, for the picker: what each holds and how many orders. */
	const onList = $derived(
		new Map(views.map((view) => [view.card.id, { amount: view.total, orders: view.orders.length }])),
	)

	/** Plays the sheet's exit, then runs `then` (which should close it); at once with no sheet. */
	const leaveSheet = (then: () => void) => {
		if (sheetRef) sheetRef.leave(then)
		else then()
	}

	const addCard = (cardId: string, next: boolean) => {
		if (next) {
			onadd(cardId)
			onsheet({ kind: "pick" })
			return
		}
		leaveSheet(() => {
			onadd(cardId)
			onsheet(null)
		})
	}

	const removeCard = (cardId: string) =>
		leaveSheet(() => {
			forget(cardId)
			onremove(cardId)
			onsheet(null)
		})

	/** Enter in a card's sheet: adds it and goes on to the next, or closes when it is on the list. */
	const onEnter = (event: KeyboardEvent, card: Card) => {
		if (event.key !== "Enter" || event.isComposing) return
		event.preventDefault()
		if (adding) addCard(card.id, true)
		else leaveSheet(() => onsheet(null))
	}

	const at = $derived(sheetCard ? cards.findIndex((c) => c.id === sheetCard.id) : -1)

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet chip(card: Card)}
	<span class="mini" data-g={groupColor(card, groups) ?? undefined}>{card.last4}</span>
{/snippet}

{#snippet note(card: Card, warning: AmountWarning, line: DraftLine, single: boolean)}
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
			{#if warning.room > 0 && single}
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
			<a data-action="see-card" href={withRecord("/cards", { kind: "card", id: card.id })}
				>{tr("purchaseList.warn.seeCard")}</a
			>
		</p>
	{:else if warning.kind === "close-date"}
		<p class="note" data-warning="close-date">
			{tr("purchaseList.warn.closeDate", { card: cardName(card.id, card), date: shown(warning.closeDate) })}
		</p>
	{/if}
{/snippet}

{#snippet cardStep(card: Card, view: ReturnType<typeof viewOf>)}
	{@const many = view.orders.length > 1}
	{@const of = usage.get(card.id)}
	<div class="card-step" data-card={card.id} data-adding={adding ? "" : undefined} bind:this={stepRoot}>
		{#if adding}
			<button
				type="button"
				class="to-pick"
				data-variant="quiet"
				data-action="to-pick"
				onclick={() => onsheet({ kind: "pick" })}>
				<SvgIcon name="back" />{tr("purchaseList.toPicker")}
			</button>
		{/if}
		<div class="card-title" row>
			<span class="card-panel">
				{@render chip(card)}
				<span class="what">
					<b class="card-label">{cardLine(card.id, card, { short: true })}</b>
					<small>{facts(card.id)}</small>
				</span>
			</span>
			{#if !adding && cards.length > 1}
				<span class="steps" row>
					<button
						type="button"
						data-variant="quiet"
						data-action="prev-card"
						aria-label={tr("purchaseList.prevCard")}
						disabled={at <= 0}
						onclick={() => {
							const prev = cards[at - 1]
							if (prev) onsheet({ kind: "card", cardId: prev.id })
						}}>
						<SvgIcon name="back" />
					</button>
					<button
						type="button"
						data-variant="quiet"
						data-action="next-card"
						aria-label={tr("purchaseList.nextCard")}
						disabled={at >= cards.length - 1}
						onclick={() => {
							const next = cards[at + 1]
							if (next) onsheet({ kind: "card", cardId: next.id })
						}}>
						<SvgIcon name="back" />
					</button>
				</span>
			{/if}
		</div>
		{#if of}
			<UsageChart usage={of} room={rooms.get(card.id)?.room} tone={tileTone(card, groups)} />
		{/if}
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
						enterkeyhint={adding ? "next" : "done"}
						data-field="amount"
						placeholder="0"
						aria-label={many ? tr("purchaseList.amountForOrder", named) : tr("purchaseList.amountFor", named)}
						value={typed[card.id]?.[order] ?? ""}
						oninput={(e) => setAmount(card.id, order, e.currentTarget.value)}
						onkeydown={(e) => onEnter(e, card)}>
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
						oninput={(e) => setNote(card.id, order, e.currentTarget.value)}
						onkeydown={(e) => onEnter(e, card)}>
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
				{@render note(card, warning, view.line, !many)}
			{/each}
		{/if}
		<div class="step-actions" row>
			{#if adding}
				<button type="button" data-variant="quiet" data-action="add-next" onclick={() => addCard(card.id, true)}>
					{tr("purchaseList.addNext")}
				</button>
				<button type="button" data-action="add-to-list" onclick={() => addCard(card.id, false)}>
					{tr("purchaseList.addToList")}
				</button>
			{:else}
				<button type="button" data-variant="danger" data-action="remove" onclick={() => removeCard(card.id)}>
					{tr("purchaseList.removeFromList")}
				</button>
				<button type="button" data-action="done" onclick={() => leaveSheet(() => onsheet(null))}>
					{tr("purchaseList.done")}
				</button>
			{/if}
		</div>
	</div>
{/snippet}

<div class="list-layout">
	<div class="list-layout__main">
		{#if cards.length === 0}
			<button type="button" class="empty-add" data-action="add-card" onclick={() => onsheet({ kind: "pick" })}>
				<b>+ {tr("purchaseList.addCard")}</b>
				<small class="empty">{tr("purchaseList.noCards")}</small>
			</button>
		{:else}
			<div class="row-panel lines">
				{#each views as view (view.card.id)}
					{@const card = view.card}
					<button
						type="button"
						class="line"
						data-card={card.id}
						data-warn={view.warn ? "" : undefined}
						data-action="open-card"
						onclick={() => onsheet({ kind: "card", cardId: card.id })}>
						{@render chip(card)}
						<span class="what">
							<b class="card-label">{cardLine(card.id, card, { short: true })}</b>
							<small data-tone={view.warn ? "warn" : undefined}>{detail(view)}</small>
						</span>
						<b class="sum" data-blank={view.total > 0 ? undefined : ""}>
							{view.total > 0 ? formatAmount(view.total) : tr("purchaseList.row.noAmount")}
						</b>
						<SvgIcon name="chevron" />
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="add-card"
				data-variant="quiet"
				data-action="add-card"
				onclick={() => onsheet({ kind: "pick" })}>
				+ {tr("purchaseList.addCard")}
			</button>
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

{#if sheet?.kind === "pick" || (sheetCard && sheetView)}
	<Sheet
		bind:this={sheetRef}
		wide
		heading={tr(sheet?.kind === "card" && !adding ? "purchaseList.edit.title" : "purchaseList.pick.title")}
		onclose={() => onsheet(null)}>
		{#if sheet?.kind === "pick"}
			<ListCardPicker
				rows={ready}
				{usage}
				{groups}
				{onList}
				onpick={(cardId: string) => onsheet({ kind: "card", cardId })} />
		{:else if sheetCard && sheetView}
			{@render cardStep(sheetCard, sheetView)}
		{/if}
	</Sheet>
{/if}

<style>
	/* The layout, the side panel and the bar are app.css's `.list-layout` and `.action-bar`; the
	   card chip is its `.card-panel` and `.mini`, and the rows sit in its `.row-panel`. What
	   follows is what this step adds on top. */

	/* On a phone the step keeps listLayout's tighter gap; app.css's wider one is the review's and
	   the saved list's. From 900px both share app.css's grid gap. */
	@media (max-width: 899px) {
		.list-layout {
			gap: var(--cc-space-4);
		}
	}

	/* The list: one row panel, a row per card that opens its sheet. */
	.lines {
		display: flex;
		flex-direction: column;
		overflow: clip;
	}

	.lines > button.line {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		align-self: stretch;
		gap: var(--cc-space-3);
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
	.lines > button.line + button.line {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	/* Hover is a quiet ground carried across the panel's side padding (DD-105, DD-109). */
	.lines > button.line:hover {
		background: var(--cc-surface-sunken);
		box-shadow:
			calc(var(--cc-space-4) * -1) 0 0 var(--cc-surface-sunken),
			var(--cc-space-4) 0 0 var(--cc-surface-sunken);
	}

	.lines > button.line:focus-visible {
		box-shadow: var(--cc-focus-ring-inset);
	}

	/* A row with a warning: an amber bar at its start, beside the words that say why (UI-07). */
	.lines > button.line[data-warn] {
		box-shadow: inset var(--cc-rule-width) 0 0 var(--cc-warning);
		padding-inline-start: var(--cc-space-2);
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

	.what small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.what small[data-tone="warn"] {
		font-weight: 600;
		color: var(--cc-warning);
	}

	.sum {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.sum[data-blank] {
		font-size: var(--cc-text-sm);
		font-weight: 400;
		font-style: italic;
		color: var(--cc-text-muted);
	}

	/* The row's chevron points the way it opens: to the side, into the sheet. */
	.line :global(.icon) {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
		color: var(--cc-text-muted);
		transform: rotate(-90deg);
	}

	.add-card {
		align-self: stretch;
		padding: var(--cc-space-3);
	}

	/* An empty list is one large target to add the first card. */
	.empty-add {
		display: grid;
		gap: var(--cc-space-1);
		align-self: stretch;
		padding: var(--cc-space-5) var(--cc-space-4);
		font-size: var(--cc-text-md);
		color: var(--cc-text);
		text-align: center;
		white-space: normal;
		cursor: pointer;
		background: transparent;
		border: calc(var(--cc-border-width) * 1.5) dashed var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.empty-add:hover {
		background: var(--cc-surface-sunken);
	}

	.empty {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	/* One card in the sheet: its name, its use, its orders, and the buttons at the foot. */
	.card-step {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-3);
	}

	.to-pick {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: var(--cc-space-1);
		padding: var(--cc-space-1) var(--cc-space-2);
		font-size: var(--cc-text-sm);
	}

	.card-title {
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-3);
	}

	.steps {
		flex: none;
		gap: var(--cc-space-1);
	}

	.steps button {
		display: inline-grid;
		place-items: center;
		padding: var(--cc-space-2);
		line-height: 0;
	}

	.steps button:disabled {
		cursor: default;
		opacity: 0.4;
	}

	.to-pick :global(.icon),
	.steps :global(.icon) {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	.bigin {
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

	.bigin input {
		flex: 1;
		min-inline-size: 0;
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
		justify-self: start;
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

	/* After the icon sizes above: the one arrow turned to point forward. */
	.steps button[data-action="next-card"] :global(.icon) {
		transform: scaleX(-1);
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

	.line-note {
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.line-note input {
		min-inline-size: 0;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
	}

	.list-layout .note,
	.card-step .note {
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

	/* The sheet's two buttons share its width, the main one last. */
	.step-actions {
		gap: var(--cc-space-2);
		padding-block-start: var(--cc-space-2);
	}

	.step-actions button {
		flex: 1 1 0;
		padding-block: var(--cc-space-3);
	}

	.step-actions button[data-variant="danger"] {
		flex: 0 0 auto;
	}

	.when {
		gap: var(--cc-space-3);
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
</style>
