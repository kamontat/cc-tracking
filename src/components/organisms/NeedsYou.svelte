<script lang="ts">
	import type { NeedsItem } from "#lib/domain/home"
	import type { Card, CardPayment, LimitGroup, PlainDate, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { CycleInput } from "#lib/ui/cycle-line"
	import type { ActionKind, RowPart, Say } from "#lib/ui/row-text"

	import { onMount, untrack } from "svelte"

	import ActionRow from "#components/molecules/ActionRow.svelte"
	import TwoStepButtons from "#components/molecules/TwoStepButtons.svelte"
	import { addDays } from "#lib/domain/date"
	import { formatAmount, MINUS } from "#lib/domain/money"
	import { listTotal, mergeCandidates } from "#lib/domain/purchase-list"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { PAST_TODAY } from "#lib/ui/cycle-line"
	import { listPageAddress } from "#lib/ui/list-address"
	import { OpenRows } from "#lib/ui/open-row.svelte"
	import { payAddress } from "#lib/ui/pay-address"
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
	 * What needs doing on Home, money at risk first (DD-62): bills past due, late plans, replies
	 * to record, payments planned soon, drafts to finish. Each is the shared opening row
	 * (`ActionRow`, DD-108): its icon says the kind and the amount sits on the right. A row opens
	 * in place (one at a time) to a drawer of one sentence and its buttons (DD-165): an overdue
	 * bill its billing cycle line, red up to today, *Pay* the amount left and *Open card*; a plan
	 * *Paid* (`onmarkpaid`) and a two-step *Delete* (`ondeletepayment`); a waiting list its lines,
	 * *Record reply* and a two-step *Confirm* (`onconfirmlist`); a draft its lines, *Continue* and
	 * a one-step *Delete* (`ondeletedraft`, DD-74); a waiting list or draft that shares its day
	 * with another of its status also *Merge* (`onmergelists`, DD-187). Home writes them. More than five show the
	 * first five and *See more (N)*, which opens the rest in place, in the same order.
	 */
	interface Props {
		items?: NeedsItem[]
		/** Every stored card, to name a draft's cards. */
		cards?: Card[]
		/** Every stored limit group, to say whose card it is (DR-13). */
		groups?: LimitGroup[]
		/** Today, to say how far off a planned payment is. */
		today?: PlainDate
		/** *Paid* on a planned payment. */
		onmarkpaid?: ((payment: CardPayment) => void) | undefined
		/** The second *Delete* on a planned payment. */
		ondeletepayment?: ((payment: CardPayment) => void) | undefined
		/** The second *Confirm* on a waiting list. */
		onconfirmlist?: ((list: PurchaseList) => void) | undefined
		/** *Delete* on a draft. */
		ondeletedraft?: ((list: PurchaseList) => void) | undefined
		/** *Merge* on a waiting list or draft: the other same-day lists of its status go into it. */
		onmergelists?: ((list: PurchaseList) => void) | undefined
	}

	const {
		items = [],
		cards = [],
		groups = [],
		today = "",
		onmarkpaid,
		ondeletepayment,
		onconfirmlist,
		ondeletedraft,
		onmergelists,
	}: Props = $props()

	/** Every waiting list and draft on Home, folded or not, to find a list's merge partners. */
	const lists = $derived(items.flatMap((item) => (item.kind === "waiting" || item.kind === "draft" ? [item.list] : [])))

	/** How many things show before *See more*. */
	const SHOWN = 5

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let root = $state<HTMLElement | undefined>()
	/** The two-step *Delete* and *Confirm* swaps, shared with the ledger. */
	const steps = new TwoStep(() => root)
	/** The one open row, by `rowId`; a swap ends when its row closes. */
	const rows = new OpenRows(
		"cc-needs-you",
		() => root,
		() => steps.reset(),
	)

	/** Whether the things past the first `SHOWN` are open (DD-106). */
	let expanded = $state(false)

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

	const shown = $derived(expanded ? items : items.slice(0, SHOWN))

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
					...waitingText(item.list, cards, groups),
					amount: listAmount(item.list),
					parts: listParts(item.list, cards),
					say: say("row.say.sent", { date: sentWords(item.list) }),
				}
			case "overdue":
				return {
					...overdueText(item.card, groups, item.days),
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
					...plannedText(item.payment, item.card, groups, today),
					amount: { text: `+${formatAmount(item.payment.amount)}`, tone: "in" },
					// The subtitle has no note, so the sentence carries it.
					say: plannedSay(item.payment),
				}
			case "draft":
				return {
					...draftText(item.list, cards, groups),
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
	<h1 tabindex="-1" data-refocus="needs">{heading}</h1>
	{#if items.length === 0}
		<p class="note" data-tone="ok">{tr("home.caughtUpDetail")}</p>
	{:else}
		<div class="row-panel panel" id="needs-list">
			{#each shown as item (rowId(item))}
				{@const id = rowId(item)}
				{@const words = wordsOf(item)}
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
						{#snippet merge(list: PurchaseList)}
							{@const others = mergeCandidates(list, lists).length}
							{#if others > 0}
								<button type="button" data-variant="quiet" data-action="merge" onclick={() => onmergelists?.(list)}>
									{others === 1 ? tr("row.merge.one") : tr("row.merge.many", { count: others })}
								</button>
							{/if}
						{/snippet}
						{#if item.kind === "waiting"}
							{@const list = item.list}
							<a class="btn" data-action="record-reply" href={listPageAddress(list)}>{tr("row.recordReply")}</a>
							{@render merge(list)}
							<TwoStepButtons {steps} kind="list" {list} onconfirm={() => onconfirmlist?.(list)} />
						{:else if item.kind === "overdue"}
							<a class="btn" data-action="pay" href={payAddress({ cardId: item.card.id, amount: item.remaining })}
								>{tr("row.payAmount", { amount: formatAmount(item.remaining) })}</a
							><a
								class="btn"
								data-variant="quiet"
								data-action="open-card"
								href={`/card?id=${encodeURIComponent(item.card.id)}`}
								>{tr("row.openCard")}</a
							>
						{:else if item.kind === "planned"}
							{@const payment = item.payment}
							<TwoStepButtons
								{steps}
								kind="plan"
								{payment}
								card={item.card}
								onpaid={() => onmarkpaid?.(payment)}
								onremove={() => ondeletepayment?.(payment)} />
						{:else}
							{@const list = item.list}
							<a class="btn" data-action="continue" href={listPageAddress(list)}>{tr("row.continue")}</a>
							{@render merge(list)}
							<button
								type="button"
								data-variant="danger"
								data-action="delete-draft"
								onclick={() => ondeletedraft?.(list)}>
								{tr("common.delete")}
							</button>
						{/if}
					{/snippet}
				</ActionRow>
			{/each}
		</div>
		{#if items.length > SHOWN}
			<button
				type="button"
				class="more"
				data-variant="quiet"
				data-action="more"
				aria-controls="needs-list"
				aria-expanded={expanded ? "true" : "false"}
				onclick={() => {
					expanded = !expanded
				}}>
				{expanded ? tr("common.showLess") : tr("common.seeMore", { count: items.length - SHOWN })}
			</button>
		{/if}
	{/if}
</div>

<style>
	.needs {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	/* Two classes, to outrank app.css's `.page h1`. */
	.needs h1 {
		font-size: var(--cc-text-2xl);
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

	/* Two classes, to outrank app.css's `.page button` (which starts a button at the column's start). */
	.needs .more {
		align-self: center;
	}
</style>
