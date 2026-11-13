<script lang="ts">
	import type { Card, LimitGroup, OwnerRecord, PlainDate, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { RowText } from "#lib/ui/row-text"

	import { onMount } from "svelte"

	import ActionRow from "#components/molecules/ActionRow.svelte"
	import { headerDate, monthName } from "#lib/domain/date"
	import { formatAmount, MINUS } from "#lib/domain/money"
	import { listTotal } from "#lib/domain/purchase-list"
	import {
		DEFAULT_LISTS_FILTER,
		filterLists,
		type ListGroup,
		type ListsFilter,
		type ListsGroup,
		listGroups,
	} from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { draftText, savedText, waitingText } from "#lib/ui/row-text"

	/**
	 * Transactions' Lists tab: every purchase list, narrowed by the page's search and filters
	 * (`filter`, DD-189), in sections (DD-188): drafts, lists waiting for the spender, then saved
	 * lists by date, newest first; each a heading over one panel of rows. A row opens its list in
	 * the list panel (`onopenlist`, RD-23), where its actions are; the open list's row is marked
	 * (`current`). Nothing is written here.
	 */
	interface Props {
		lists?: PurchaseList[]
		cards?: Card[]
		groups?: LimitGroup[]
		/** The stored owners, to name a holder by its record (RD-30). */
		owners?: OwnerRecord[]
		/** The page's search and filters; the default shows every list. */
		filter?: ListsFilter
		/** What the lists are sectioned by: status (DD-188), month, or not at all (DD-192). */
		by?: ListsGroup
		/** Today, which a date filter's preset counts from. */
		today?: PlainDate
		/** The list open in the panel, by id. */
		current?: string | null
		/** A row's tap: opens its list in the panel. */
		onopenlist?: (list: PurchaseList) => void
	}

	const {
		lists = [],
		cards = [],
		groups = [],
		owners = [],
		filter = DEFAULT_LISTS_FILTER,
		by = "status",
		today = "",
		current = null,
		onopenlist,
	}: Props = $props()

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

	const sections = $derived(listGroups(filterLists(lists, filter, cards, today), [], by))

	/** A section's heading: its status (for saved lists, the date they were for), its month and year, or *All lists*. */
	const heading = (group: ListGroup): string => {
		void lang
		if ("month" in group) return `${monthName(`${group.month}-01`, lang)} ${group.month.slice(0, 4)}`
		if (!("status" in group)) return t("tx.lists.group.all")
		if (group.status !== "saved") return t(`tx.lists.group.${group.status}`)
		return t("tx.lists.group.saved", { date: headerDate(group.date, lang, true) })
	}

	const text = (list: PurchaseList): RowText => {
		void lang
		if (list.status === "draft") return draftText(list, cards, groups, owners)
		if (list.status === "sent") return waitingText(list, cards, groups, owners)
		return savedText(list, cards, groups, owners)
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

<div class="list-index">
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
							{@const row = text(list)}
							<ActionRow
								kind={row.kind}
								title={row.title}
								subtitle={row.subtitle}
								id={`list:${list.id}`}
								amount={amount(list)}
								current={current === list.id}
								onopen={() => onopenlist?.(list)} />
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
