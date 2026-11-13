<script lang="ts">
	import type { CardPayment, LedgerStatement, PlainDate, Purchase } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount, tick } from "svelte"
	import { SvelteSet } from "svelte/reactivity"

	import { compareDates, daysBetween, displayDate, periodLabel } from "#lib/domain/date"
	import { ledgerUrgency } from "#lib/domain/ledger"
	import { formatAmount } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * A card's statements, newest first (prototype `vCard`): one row each, `Mon YYYY` with a tag
	 * (*Current*, *Overdue N days*, *Due in N days* within 7, *Due D*, *Paid*), its dates or *paid
	 * in full*, and what is left on the right. Runs of quiet months fold into one line (DR-22). A
	 * row with purchases or payments is a button with `aria-expanded` that unfolds them: date,
	 * note, amount, *Edit* and *Delete*. *Delete* swaps in place for *Delete ฿X?* with *Delete* and
	 * *Keep* (UI-09), and focus follows the swap. Calls `oneditpurchase` and `ondeletepurchase`,
	 * each with `{ purchase }`.
	 */
	interface Props {
		statements?: LedgerStatement[]
		today?: PlainDate
		/** *Edit* on a purchase: the page opens it in the purchase sheet. */
		oneditpurchase?: ((detail: { purchase: Purchase }) => void) | undefined
		/** The second *Delete* on a purchase: the page deletes it and reloads the statements. */
		ondeletepurchase?: ((detail: { purchase: Purchase }) => void) | undefined
	}

	const { statements = [], today = "", oneditpurchase, ondeletepurchase }: Props = $props()

	type Tag = { urgency?: "overdue" | "soon"; tone?: "ok"; text: string }
	type PaymentLine = { kind: "payment"; payment: CardPayment; amount: number }
	type Line = { kind: "purchase"; purchase: Purchase } | PaymentLine

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/** The periods unfolded to their purchases. */
	const openPeriods = new SvelteSet<string>()
	/** The purchase whose *Delete* is asking, by id, and the period it sits in. */
	let asking = $state<{ id: string; period: string } | null>(null)
	/** A confirmed delete waiting for its row to go, and the statement it was in. */
	let deleted: { id: string; period: string } | null = null
	let panel = $state<HTMLElement | undefined>()

	/**
	 * What an unfolded statement lists: its purchases and the payment parts that settled it, in
	 * one run by date (a purchase before a payment on the same day). Two parts of one payment on
	 * one statement -- one naming the period, one from the pool -- read as one line.
	 */
	function linesOf(statement: LedgerStatement): Line[] {
		const payments = new Map<string, PaymentLine>()
		for (const part of statement.payments) {
			const seen = payments.get(part.payment.id)
			if (seen) seen.amount += part.amount
			else payments.set(part.payment.id, { kind: "payment", payment: part.payment, amount: part.amount })
		}
		const dateOf = (line: Line) => (line.kind === "purchase" ? line.purchase.date : line.payment.date)
		return [
			...statement.purchases.map((purchase): Line => ({ kind: "purchase", purchase })),
			...payments.values(),
		].sort((a, b) => compareDates(dateOf(a), dateOf(b)))
	}

	/**
	 * Statements in order, with each run of quiet ones -- closed, nothing spent, nothing paid --
	 * gathered into an array (DR-22). The open period stays whole even when empty.
	 */
	const segments = $derived.by(() => {
		const out: (LedgerStatement | LedgerStatement[])[] = []
		for (const statement of statements) {
			const quiet =
				statement.purchases.length === 0 && statement.paidAmount === 0 && ledgerUrgency(statement, today) !== "open"
			const last = out.at(-1)
			if (!quiet) out.push(statement)
			else if (Array.isArray(last)) last.push(statement)
			else out.push([statement])
		}
		return out
	})

	/**
	 * The statement a purchase made today lands on: the earliest one not yet closed. Later ones
	 * exist only when a purchase is dated ahead, and are not current.
	 */
	const currentPeriod = $derived.by(() => {
		let current: LedgerStatement | null = null
		for (const statement of statements) {
			if (compareDates(today, statement.closeDate) > 0) continue
			if (!current || compareDates(statement.closeDate, current.closeDate) < 0) current = statement
		}
		return current?.period ?? null
	})

	function quietText(run: LedgerStatement[]): string {
		// Statements arrive newest first; the range reads oldest to newest.
		const newest = periodLabel(run[0]?.period ?? "", lang)
		const oldest = periodLabel(run.at(-1)?.period ?? "", lang)
		return run.length === 1
			? tr("statements.quietOne", { period: newest })
			: tr("statements.quietRun", { from: oldest, to: newest })
	}

	function tagOf(statement: LedgerStatement): Tag | null {
		if (statement.period === currentPeriod) return { tone: "ok", text: tr("statements.current") }
		const urgency = ledgerUrgency(statement, today)
		if (urgency === "paid") return { text: tr("statements.paidTag") }
		if (urgency === "overdue") {
			const days = daysBetween(statement.dueDate, today)
			return { urgency, text: tr(days === 1 ? "pay.tag.overdue.one" : "pay.tag.overdue.many", { days }) }
		}
		if (urgency === "soon") {
			const days = daysBetween(today, statement.dueDate)
			return { urgency, text: tr(days === 1 ? "pay.tag.soon.one" : "pay.tag.soon.many", { days }) }
		}
		if (urgency === "due") return { text: tr("pay.tag.due", { date: displayDate(statement.dueDate, lang) }) }
		return null
	}

	/** Unfolds or folds a statement; folding drops a half-done delete inside it. */
	function toggle(period: string) {
		if (openPeriods.has(period)) {
			openPeriods.delete(period)
			if (asking?.period === period) asking = null
		} else openPeriods.add(period)
	}

	/** Swaps a purchase's buttons, then focuses the button `action` of that purchase. */
	async function swap(next: { id: string; period: string } | null, action: string, id: string) {
		asking = next
		await tick()
		panel?.querySelector<HTMLElement>(`[data-purchase="${CSS.escape(id)}"] [data-action="${action}"]`)?.focus()
	}

	function confirmDelete(purchase: Purchase, period: string) {
		asking = null
		deleted = { id: purchase.id, period }
		ondeletepurchase?.({ purchase })
	}

	/**
	 * Once the statements reload after a confirmed delete: with the row gone, focus would fall to
	 * the page, so it moves to the statement's own button (any statement's, when that one has
	 * nothing left to unfold). A row still there means the delete failed; focus stays as it is.
	 */
	$effect(() => {
		void statements
		const pending = deleted
		if (!pending || !panel) return
		deleted = null
		if (panel.querySelector(`[data-purchase="${CSS.escape(pending.id)}"]`)) return
		;(
			panel.querySelector<HTMLElement>(`[data-period="${CSS.escape(pending.period)}"] button.head`) ??
			panel.querySelector<HTMLElement>("button.head")
		)?.focus()
	})

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet body(statement: LedgerStatement)}
	{@const tag = tagOf(statement)}
	<span class="what">
		<span class="title">
			<b class="name">{periodLabel(statement.period, lang)}</b>
			{#if tag}
				<span class="tag" data-urgency={tag.urgency} data-tone={tag.tone}>{tag.text}</span>
			{/if}
		</span>
		<span class="sub"
			>{ledgerUrgency(statement, today) === "paid"
				? tr("statements.paid")
				: tr("statements.header", {
						close: displayDate(statement.closeDate, lang),
						due: displayDate(statement.dueDate, lang),
					})}</span
		>
	</span>
	<span class="r">
		<span class="left" data-numeric data-zero={statement.remaining === 0 ? "" : undefined}
			>{formatAmount(statement.remaining)}</span
		>
		{#if !statement.paid && statement.paidAmount > 0}
			<small class="paid-part">{tr("statements.paidAmount", { amount: formatAmount(statement.paidAmount) })}</small>
		{/if}
	</span>
{/snippet}

{#snippet paymentLine(line: PaymentLine)}
	<li class="purchase payment" data-payment={line.payment.id}>
		<span class="pdate">{displayDate(line.payment.date, lang)}</span>
		<span class="pnote"
			><span>{tr("statements.payment")}</span>
			{#if line.amount < line.payment.amount}
				<small class="ppart">{tr("statements.partOf", { total: formatAmount(line.payment.amount) })}</small>
			{/if}</span
		>
		<span class="pamount in" data-numeric>+{formatAmount(line.amount)}</span>
	</li>
{/snippet}

{#snippet purchaseLine(purchase: Purchase, period: string)}
	{@const amount = formatAmount(purchase.amount)}
	{@const date = displayDate(purchase.date, lang)}
	<li class="purchase" data-purchase={purchase.id}>
		<span class="pdate">{date}</span>
		<span class="pnote">{purchase.note}</span>
		<span class="pamount" data-numeric>{amount}</span>
		<span class="pactions">
			{#if asking?.id === purchase.id}
				<span class="ask">{tr("card.purchase.deleteAsk", { amount })}</span>
				<button
					type="button"
					data-variant="danger"
					data-action="confirm-delete"
					onclick={() => confirmDelete(purchase, period)}>
					{tr("common.delete")}
				</button>
				<button
					type="button"
					data-variant="quiet"
					data-action="keep"
					onclick={() => swap(null, "delete-purchase", purchase.id)}>
					{tr("card.purchase.keep")}
				</button>
			{:else}
				<button
					type="button"
					data-variant="quiet"
					data-action="edit-purchase"
					aria-label={tr("card.purchase.editOne", { amount, date })}
					onclick={() => oneditpurchase?.({ purchase })}>
					{tr("common.edit")}
				</button>
				<button
					type="button"
					data-variant="danger"
					data-action="delete-purchase"
					aria-label={tr("card.purchase.deleteOne", { amount, date })}
					onclick={() => swap({ id: purchase.id, period }, "confirm-delete", purchase.id)}>
					{tr("common.delete")}
				</button>
			{/if}
		</span>
	</li>
{/snippet}

{#snippet statementRow(statement: LedgerStatement)}
	{@const lines = linesOf(statement)}
	{@const open = lines.length > 0 && openPeriods.has(statement.period)}
	{@const listId = `purchases-${statement.period}`}
	<div class="statement" data-period={statement.period}>
		{#if lines.length > 0}
			<button
				type="button"
				class="crow head"
				aria-expanded={open ? "true" : "false"}
				aria-controls={open ? listId : undefined}
				onclick={() => toggle(statement.period)}>
				{@render body(statement)}
			</button>
		{:else}
			<div class="crow head">{@render body(statement)}</div>
		{/if}
		{#if open}
			<ul class="purchases" id={listId}>
				{#each lines as line (line.kind === "purchase" ? `p:${line.purchase.id}` : `y:${line.payment.id}`)}
					{#if line.kind === "purchase"}
						{@render purchaseLine(line.purchase, statement.period)}
					{:else}
						{@render paymentLine(line)}
					{/if}
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

{#if statements.length === 0}
	<p class="empty">{tr("statements.empty")}</p>
{:else}
	<div class="panel row-panel" bind:this={panel}>
		{#each segments as segment, i (Array.isArray(segment) ? `quiet:${segment[0]?.period ?? i}` : segment.period)}
			{#if Array.isArray(segment)}
				<p class="quiet">{quietText(segment)}</p>
			{:else}
				{@render statementRow(segment)}
			{/if}
		{/each}
	</div>
{/if}

<style>
	/*
	 * The panel is app.css's light-DOM row panel (`.row-panel`); it clips the heads' hover ground
	 * at its rounded corners. Selectors that meet app.css's `.page button` / `.page small` carry at
	 * least two classes (the scope's and their own), so they outrank it.
	 */
	.panel {
		display: flex;
		flex-direction: column;
		overflow: clip;
		container: statements / inline-size;
	}

	.statement {
		display: flex;
		flex-direction: column;
	}

	/* A row: the `.what` and the right-aligned `.r` figure (rowPanel's `.crow`). */
	.panel .crow {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		align-self: stretch;
		gap: var(--cc-space-1) var(--cc-space-3);
		/* The head reaches a little past the text into the panel's side padding, so its ring --
		   drawn inside, never clipped by the panel -- keeps clear of the text and of the panel's
		   edge alike (the unfolded items stay on the text's line, inset from it). */
		inline-size: auto;
		margin: 0 calc(var(--cc-space-2) * -1);
		padding: var(--cc-space-3) var(--cc-space-2);
		font: inherit;
		font-size: var(--cc-text-md);
		font-weight: 400;
		line-height: var(--cc-leading);
		white-space: normal;
		text-align: start;
		text-decoration: none;
		color: var(--cc-text);
		cursor: pointer;
		background: transparent;
		border: 0;
		border-radius: 0;
	}

	.panel div.crow {
		cursor: default;
	}

	/* Hover is a quiet ground, never an underline (DD-105), carried across the side padding: a
	   square band that meets the panel's edges, as every row list's does (DD-109). */
	.panel button.crow:hover {
		text-decoration: none;
		background: var(--cc-surface-sunken);
		box-shadow:
			calc(var(--cc-space-2) * -1) 0 0 var(--cc-surface-sunken),
			var(--cc-space-2) 0 0 var(--cc-surface-sunken);
	}

	.panel button.crow:focus-visible,
	.panel button.crow:hover:focus-visible {
		outline: none;
		box-shadow: var(--cc-focus-ring-inset);
	}

	/* A neutral tag, whose fill is the hover ground, turns to the surface so it still shows. */
	.panel button.crow:hover .tag:not([data-tone], [data-urgency]) {
		background: var(--cc-surface);
	}

	.what {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: calc(var(--cc-space-1) / 2);
		min-inline-size: 0;
		line-height: 1.35;
	}

	.title {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cc-space-1) var(--cc-space-2);
	}

	.name {
		font-weight: 650;
	}

	.sub {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--cc-space-2);
		font-size: var(--cc-text-xs);
		font-weight: 400;
		color: var(--cc-text-muted);
	}

	.r {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--cc-space-1);
		line-height: 1.25;
		text-align: end;
	}

	.r small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.left {
		font-weight: 650;
		white-space: nowrap;
	}

	.left[data-zero] {
		color: var(--cc-text-muted);
	}

	/* A pill with a dot that carries a word as well as a colour (cardBits' `.tag`). */
	.tag {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		align-self: center;
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

	.tag[data-urgency="overdue"] {
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
	}

	.tag[data-urgency="soon"] {
		color: var(--cc-warning);
		background: var(--cc-warning-surface);
	}

	.tag[data-tone="ok"] {
		color: var(--cc-success);
		background: var(--cc-accent-surface);
	}

	/* One grid for the whole list -- date, note, amount, then actions -- that each line takes up as a
	   subgrid, so dates, notes and amounts line up from line to line, a payment line (which has
	   no actions) included. */
	.purchases {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0 var(--cc-space-3);
		/* A gap above the items, so the head's hover tint never runs into them. */
		padding: var(--cc-space-2) 0 var(--cc-space-3);
		margin: 0;
		text-align: start;
		list-style: none;
	}

	.purchase {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		align-items: center;
		row-gap: var(--cc-space-1);
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		background: var(--cc-surface-sunken);
	}

	/* A payment line reads along one baseline -- date, *Payment*, amount -- with *(part of ฿X)*
	   on its own line under *Payment*. */
	.payment {
		align-items: baseline;
	}

	.purchase:first-child {
		border-radius: var(--cc-radius-sm) var(--cc-radius-sm) 0 0;
	}

	.purchase:last-child {
		border-radius: 0 0 var(--cc-radius-sm) var(--cc-radius-sm);
	}

	.purchase:only-child {
		border-radius: var(--cc-radius-sm);
	}

	.purchase + .purchase {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	.pdate {
		color: var(--cc-text-muted);
		white-space: nowrap;
	}

	.pnote {
		overflow-wrap: anywhere;
	}

	/* Amounts share the list's column, flush right in it, so they line up. */
	.pamount {
		justify-self: end;
		font-weight: 600;
		white-space: nowrap;
	}

	.pamount.in {
		color: var(--cc-success);
	}

	.payment .pnote {
		display: grid;
		justify-items: start;
	}

	.payment .pamount {
		grid-column: 3;
	}

	.ppart {
		display: block;
		font-size: var(--cc-text-xs);
		white-space: nowrap;
		color: var(--cc-text-muted);
	}

	.pactions {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--cc-space-2);
		grid-column: 1 / -1;
	}

	.pactions button {
		align-self: auto;
		padding: var(--cc-space-1) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		white-space: nowrap;
	}

	.ask {
		font-weight: 600;
	}

	/* The buttons take their own line under the date, note and amount, unless the panel is wide
	   enough for all of it on one: the panel's width decides, since on a desktop it sits in the
	   narrow side column. A container query takes no var(), so the width is here. */
	@container statements (min-width: 34rem) {
		.purchases {
			grid-template-columns: auto minmax(0, 1fr) auto auto;
		}

		.pactions {
			grid-column: auto;
		}
	}

	.quiet {
		margin: 0;
		padding: var(--cc-space-2) 0;
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.empty {
		margin: 0;
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
	}

	@media (forced-colors: active) {
		.panel button.crow:focus-visible {
			outline: var(--cc-border-width) solid;
		}
	}
</style>
