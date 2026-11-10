<script lang="ts">
	import type { Card, LimitGroup, PlainDate, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { RowText, Say } from "#lib/ui/row-text"

	import { onMount } from "svelte"

	import ActionRow from "#components/molecules/ActionRow.svelte"
	import TwoStepButtons from "#components/molecules/TwoStepButtons.svelte"
	import { headerDate } from "#lib/domain/date"
	import { formatAmount, MINUS } from "#lib/domain/money"
	import { listTotal, mergeCandidates } from "#lib/domain/purchase-list"
	import {
		DEFAULT_LISTS_FILTER,
		filterLists,
		type ListGroup,
		type ListsFilter,
		listGroups,
	} from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { listPageAddress } from "#lib/ui/list-address"
	import { OpenRows } from "#lib/ui/open-row.svelte"
	import { draftText, listParts, money, savedText, say, sentWords, waitingText } from "#lib/ui/row-text"
	import { TwoStep } from "#lib/ui/two-step.svelte"

	/**
	 * Transactions' Lists view: every purchase list, narrowed by the page's search and filters
	 * (`filter`, DD-189), in sections (DD-188): drafts, lists waiting for the spender, then saved lists by date,
	 * newest first; each a heading over one panel of rows that open in place (DD-108, DD-165). An opened draft
	 * offers *Continue* and *Delete*, a waiting list *Record reply* and a two-step *Confirm*, a
	 * saved list *Open*; a draft or waiting list that shares its day and status with others also
	 * offers *Merge* (DD-187). Nothing is written here: the page hears the callbacks.
	 */
	interface Props {
		lists?: PurchaseList[]
		cards?: Card[]
		groups?: LimitGroup[]
		/** The page's search and filters; the default shows every list. */
		filter?: ListsFilter
		/** Today, which a date filter's preset counts from. */
		today?: PlainDate
		/** A waiting list's *Confirm*, after its second step. */
		onconfirmlist?: (list: PurchaseList) => void
		/** A draft's *Delete*. */
		ondeletedraft?: (list: PurchaseList) => void
		/** *Merge*: the other same-day lists of its status go into this one. */
		onmergelists?: (list: PurchaseList) => void
	}

	const {
		lists = [],
		cards = [],
		groups = [],
		filter = DEFAULT_LISTS_FILTER,
		today = "",
		onconfirmlist,
		ondeletedraft,
		onmergelists,
	}: Props = $props()

	let root = $state<HTMLElement | undefined>()

	/** The two-step *Confirm* swap, shared with Home and the ledger. */
	const steps = new TwoStep(() => root)
	/** The one open row, by `list:${id}`; a swap ends when its row closes. */
	const rows = new OpenRows(
		"cc-list-index",
		() => root,
		() => steps.reset(),
	)

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)

	// Merge still looks at every list (`lists`): a list the filter hides is on that day all the same.
	const sections = $derived(listGroups(filterLists(lists, filter, cards, today), []))

	$effect.pre(() => {
		rows.prune(sections.flatMap((g) => g.lists.map((l) => `list:${l.id}`)))
	})

	/** A section's heading: its status, or for saved lists the date they were for. */
	const heading = (group: ListGroup): string => {
		void lang
		if (group.status !== "saved") return t(`tx.lists.group.${group.status}`)
		return t("tx.lists.group.saved", { date: headerDate(group.date, lang, true) })
	}

	const text = (list: PurchaseList): RowText => {
		void lang
		if (list.status === "draft") return draftText(list, cards, groups)
		if (list.status === "sent") return waitingText(list, cards, groups)
		return savedText(list, cards, groups)
	}

	/** The opened row's one sentence: not sent yet, when it was sent, or what it bought. */
	const words = (list: PurchaseList): string | Say => {
		void lang
		if (list.status === "draft") return t("row.say.draft")
		if (list.status === "sent") return say("row.say.sent", { date: sentWords(list) })
		return say("row.say.saved", { total: money(formatAmount(listTotal(list))) })
	}

	const parts = (list: PurchaseList) => {
		void lang
		return listParts(list, cards)
	}

	/** A saved list is money out like a ledger purchase; a total of nothing (a draft with no amounts yet too) has no sign. */
	const amount = (list: PurchaseList): { text: string; tone: "out" | "muted" } => {
		const sum = listTotal(list)
		const total = formatAmount(sum)
		if (sum === 0) return { text: total, tone: "muted" }
		if (list.status !== "saved") return { text: `${MINUS}${total}`, tone: "muted" }
		return { text: `${MINUS}${total}`, tone: "out" }
	}
</script>

<div class="list-index" bind:this={root}>
	{#if lists.length === 0}
		<p class="empty" tabindex="-1" data-refocus="lists">{tr("tx.lists.empty")}</p>
	{:else}
		{#if sections.length === 0}
			<p class="empty" tabindex="-1" data-refocus="lists">{tr("tx.lists.noMatch")}</p>
		{:else}
			{#each sections as group (group.key)}
				<section class="group" data-section={group.key}>
					<h3 class="sec-title" tabindex="-1" data-refocus={`lists:${group.key}`}>{heading(group)}</h3>
					<div class="row-panel">
						{#each group.lists as list (list.id)}
							{@const id = `list:${list.id}`}
							{@const row = text(list)}
							{@const href = listPageAddress(list)}
							<ActionRow
								kind={row.kind}
								title={row.title}
								subtitle={row.subtitle}
								{id}
								detailsId={rows.detailsId(id)}
								expanded={rows.isOpen(id)}
								ontoggle={() => rows.toggle(id)}
								amount={amount(list)}
								parts={parts(list)}
								say={words(list)}>
								{#snippet actions()}
									{@const others = mergeCandidates(list, lists).length}
									{#snippet merge()}
										<button type="button" data-variant="quiet" data-action="merge" onclick={() => onmergelists?.(list)}>
											{others === 1 ? tr("row.merge.one") : tr("row.merge.many", { count: others })}
										</button>
									{/snippet}
									{#if list.status === "draft"}
										<a class="btn" data-action="continue" {href}>{tr("row.continue")}</a>
										{#if others > 0}
											{@render merge()}
										{/if}
										<button
											type="button"
											data-variant="danger"
											data-action="delete-draft"
											onclick={() => ondeletedraft?.(list)}>
											{tr("common.delete")}
										</button>
									{:else if list.status === "sent"}
										<a class="btn" data-action="record-reply" {href}>{tr("row.recordReply")}</a>
										{#if others > 0}
											{@render merge()}
										{/if}
										<TwoStepButtons {steps} kind="list" {list} onconfirm={() => onconfirmlist?.(list)} />
									{:else}
										<a class="btn" data-action="open" {href}>{tr("row.open")}</a>
									{/if}
								{/snippet}
							</ActionRow>
						{/each}
					</div>
				</section>
			{/each}
		{/if}
	{/if}
</div>

<style>
	.list-index {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	/* app.css draws the panel; it clips a hovered row's ground at its rounded corners (DD-109). */
	.row-panel {
		overflow: clip;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-2);
		min-inline-size: 0;
	}

	/* A small, muted, uppercase heading over its panel, as the ledger's days are. */
	.sec-title {
		margin: 0;
		font-size: var(--cc-text-xs);
		font-weight: 650;
		letter-spacing: var(--cc-tracking-caps);
		text-transform: uppercase;
		color: var(--cc-text-muted);
	}

	.empty {
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
	}
</style>
