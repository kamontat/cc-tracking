<script lang="ts">
	import type { NeedsItem } from "#lib/domain/home"
	import type { Card, CardPayment, LimitGroup, OwnerRecord, PlainDate, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { CycleInput } from "#lib/ui/cycle-line"
	import type { ActionKind, RowPart, Say } from "#lib/ui/row-text"

	import { onMount, untrack } from "svelte"

	import ActionRow from "#components/molecules/ActionRow.svelte"
	import TwoStepButtons from "#components/molecules/TwoStepButtons.svelte"
	import { addDays } from "#lib/domain/date"
	import { formatAmount, MINUS } from "#lib/domain/money"
	import { listTotal } from "#lib/domain/purchase-list"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { PAST_TODAY } from "#lib/ui/cycle-line"
	import { OpenRows } from "#lib/ui/open-row.svelte"
	import {
		draftText,
		listParts,
		money,
		overdueText,
		plannedSay,
		plannedText,
		say,
		sentWords,
		waitingText,
	} from "#lib/ui/row-text"
	import { TwoStep } from "#lib/ui/two-step.svelte"

	/**
	 * Home's *Needs you* tab, money at risk first (DD-62): bills past due, late plans, replies to
	 * record, payments planned soon, drafts to finish, every one of them (the tab has the screen to
	 * itself, so there is no *See more*). Each is the shared row (`ActionRow`, DD-108): its icon says
	 * the kind and the amount sits on the right. A bill or a plan opens in place (one at a time) to
	 * a drawer of one sentence and its buttons (DD-165): an overdue bill its billing cycle line, red
	 * up to today, *Pay* the amount left (`onpay`, the card's panel on its pay form) and *Open card*
	 * (`onopencard`, the card's panel); a plan *Paid* (`onmarkpaid`) and a two-step *Delete*
	 * (`ondeletepayment`). A waiting list or a draft opens the list's panel (`onopenlist`), which
	 * holds its lines and its actions; the open list's row is marked (`current`). Home writes them.
	 */
	interface Props {
		items?: NeedsItem[]
		/** Every stored card, to name a draft's cards. */
		cards?: Card[]
		/** Every stored limit group, to say whose card it is (DR-13). */
		groups?: LimitGroup[]
		/** The stored owners, to name a holder by its record (RD-30). */
		owners?: OwnerRecord[]
		/** Today, to say how far off a planned payment is. */
		today?: PlainDate
		/** The list open in the panel now, whose row is marked. */
		current?: string | null
		/** *Paid* on a planned payment. */
		onmarkpaid?: ((payment: CardPayment) => void) | undefined
		/** The second *Delete* on a planned payment. */
		ondeletepayment?: ((payment: CardPayment) => void) | undefined
		/** A waiting list's or a draft's row: open the list's panel. */
		onopenlist?: ((list: PurchaseList) => void) | undefined
		/** *Open card* on an overdue bill: open the card's panel. */
		onopencard?: ((id: string) => void) | undefined
		/** *Pay* on an overdue bill: the card's panel on its pay form, with `amount` (satang) filled in. */
		onpay?: ((card: Card, amount: number) => void) | undefined
	}

	const {
		items = [],
		cards = [],
		groups = [],
		owners = [],
		today = "",
		current = null,
		onmarkpaid,
		ondeletepayment,
		onopenlist,
		onopencard,
		onpay,
	}: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let root = $state<HTMLElement | undefined>()
	/** The two-step *Delete* swap on a plan, shared with the ledger. */
	const steps = new TwoStep(() => root)
	/** The one open row, by `rowId`; a swap ends when its row closes. */
	const rows = new OpenRows(
		"cc-needs-you",
		() => root,
		() => steps.reset(),
	)

	/** A row's id in the open-row controller, unique across kinds (a payment's id repeats across cards). */
	const rowId = (item: NeedsItem): string => {
		switch (item.kind) {
			case "overdue":
				return `due:${item.card.id}`
			case "planned":
				return `plan:${item.payment.cardId}:${item.payment.id}`
			default:
				return `list:${item.list.id}`
		}
	}

	// Before the repaint: forget an open row that is gone, and hand on its focus.
	$effect.pre(() => {
		const ids = items.map(rowId)
		untrack(() => rows.prune(ids))
	})

	const heading = $derived(
		items.length === 0
			? tr("home.caughtUp")
			: items.length === 1
				? tr("home.needs.one")
				: tr("home.needs.many", { count: items.length }),
	)

	/** What a row shows, in the reader's language. */
	type Words = {
		kind: ActionKind
		title: string
		subtitle: string
		amount: { text: string; tone: "out" | "in" | "muted" | "danger" }
		cycle?: CycleInput
		parts?: RowPart[]
		say: string | Say
	}

	/** A list's total, money out; a draft with no amounts yet totals nothing, with no sign. */
	const listAmount = (list: PurchaseList) => {
		const total = listTotal(list)
		return { text: `${total > 0 ? MINUS : ""}${formatAmount(total)}`, tone: "muted" as const }
	}

	const wordsOf = (item: NeedsItem): Words => {
		void lang
		switch (item.kind) {
			case "waiting":
				return {
					...waitingText(item.list, cards, groups, owners),
					amount: listAmount(item.list),
					parts: listParts(item.list, cards),
					say: say("row.say.sent", { date: sentWords(item.list) }),
				}
			case "overdue":
				return {
					...overdueText(item.card, groups, item.days, owners),
					amount: { text: formatAmount(item.remaining), tone: "danger" },
					// From the statement's start to a few days past today, so today sits inside.
					cycle: {
						start: item.startDate,
						end: addDays(today, PAST_TODAY),
						marks: [
							{ kind: "closed", date: item.closeDate },
							{ kind: "due", date: item.dueDate },
							{ kind: "now", date: today },
						],
						fillTo: today,
						late: true,
					},
					say: say("row.say.left", {
						left: money(formatAmount(item.remaining)),
						total: money(formatAmount(item.billed)),
						when: item.days === 1 ? t("row.say.late.one") : t("row.say.late.many", { days: item.days }),
					}),
				}
			case "planned":
				return {
					...plannedText(item.payment, item.card, groups, today, owners),
					amount: { text: `+${formatAmount(item.payment.amount)}`, tone: "in" },
					// The subtitle has no note, so the sentence carries it.
					say: plannedSay(item.payment),
				}
			case "draft":
				return {
					...draftText(item.list, cards, groups, owners),
					amount: listAmount(item.list),
					parts: listParts(item.list, cards),
					say: t("row.say.draft"),
				}
		}
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="needs" bind:this={root}>
	<h2 tabindex="-1" data-refocus="needs">{heading}</h2>
	{#if items.length === 0}
		<p class="note" data-tone="ok">{tr("home.caughtUpDetail")}</p>
	{:else}
		<div class="row-panel panel" id="needs-list">
			{#each items as item (rowId(item))}
				{@const id = rowId(item)}
				{@const words = wordsOf(item)}
				{#if item.kind === "waiting" || item.kind === "draft"}
					{@const list = item.list}
					<ActionRow
						kind={words.kind}
						title={words.title}
						subtitle={words.subtitle}
						{id}
						amount={words.amount}
						current={current === list.id}
						onopen={() => onopenlist?.(list)} />
				{:else}
					<ActionRow
						kind={words.kind}
						title={words.title}
						subtitle={words.subtitle}
						{id}
						detailsId={rows.detailsId(id)}
						expanded={rows.isOpen(id)}
						ontoggle={() => rows.toggle(id)}
						amount={words.amount}
						cycle={words.cycle}
						parts={words.parts}
						say={words.say}>
						{#snippet actions()}
							{#if item.kind === "overdue"}
								{@const due = item}
								<button type="button" data-action="pay" onclick={() => onpay?.(due.card, due.remaining)}>
									{tr("row.payAmount", { amount: formatAmount(due.remaining) })}
								</button><button
									type="button"
									data-variant="quiet"
									data-action="open-card"
									onclick={() => onopencard?.(due.card.id)}>
									{tr("row.openCard")}
								</button>
							{:else if item.kind === "planned"}
								{@const payment = item.payment}
								<TwoStepButtons
									{steps}
									kind="plan"
									{payment}
									card={item.card}
									onpaid={() => onmarkpaid?.(payment)}
									onremove={() => ondeletepayment?.(payment)} />
							{/if}
						{/snippet}
					</ActionRow>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.needs {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	/* Two classes, to outrank app.css's `.page h2`; a section heading under the page's title and tabs. */
	.needs h2 {
		font-size: var(--cc-text-lg);
		font-weight: 700;
	}

	/* The row panel (app.css `.row-panel`) clips the rows' hover ground at its rounded corners. */
	.needs .panel {
		display: flex;
		flex-direction: column;
		overflow: clip;
		box-shadow: var(--cc-shadow-sm);
	}

	.needs .note {
		padding: var(--cc-space-3) var(--cc-space-4);
		border-radius: var(--cc-radius-sm);
		background: var(--cc-surface-sunken);
	}

	.needs .note[data-tone="ok"] {
		background: var(--cc-accent-surface);
	}
</style>
