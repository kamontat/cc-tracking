<script lang="ts">
	import type { PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { RecordPanel } from "#lib/ui/record-panel.svelte"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import DetailPanel from "#components/molecules/DetailPanel.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import TwoStepButtons from "#components/molecules/TwoStepButtons.svelte"
	import { headerDate, today } from "#lib/domain/date"
	import { formatAmount } from "#lib/domain/money"
	import { listCount, listTotal, mergeCandidates } from "#lib/domain/purchase-list"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, groupColor } from "#lib/ui/card-label"
	import { listEditAddress } from "#lib/ui/list-address"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { confirmWaitingList, deleteDraftList, mergeSameDayLists } from "#lib/ui/row-actions"
	import { openRepository } from "#lib/ui/startup"
	import { TwoStep } from "#lib/ui/two-step.svelte"

	/**
	 * The list panel (PRD RD-23, RD-26): a purchase list in the detail panel, over whichever page
	 * holds `panel` (`?list=<id>`). The head is the list's date over its status and how many cards
	 * it has. The body is its lines as a row list (the card, its note, and what it is for, or for a
	 * saved list what was bought, or _Moved_ when its unmade lines went to the next day's draft,
	 * else _Not made_), each opening its card's panel a step deeper (`panel.deeper`), so Back
	 * returns here; then the total; a saved list's summary (DD-212). Then the actions its status allows: a draft's _Continue_ and a
	 * waiting list's _Record reply_ leave for the edit page (writing a list is a page, decision
	 * 4); _Merge_ when other lists of its status share its day (DD-187); a draft's one-step
	 * _Delete_ (DD-74), which closes the panel; a waiting list's two-step _Confirm_, which saves it
	 * as is (DD-108). Every write calls `onchange`, so the page behind reads its lists again. A
	 * list the store does not hold opens nothing (`panel.drop`). It reads the store itself, so any
	 * page can hold it.
	 */
	interface Props {
		/** The page's panel: which record is open, and the way through history. */
		panel: RecordPanel
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once, and when a waiting list is confirmed. */
		clock?: () => Date
		/** A write landed: the page behind reads its records again. */
		onchange?: () => void
	}

	const { panel, open = () => openRepository(), clock = () => new Date(), onchange = () => {} }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = untrack(() => today(clock()))
	let repo = $state.raw<Repository | null>(null)
	const view = $derived(panel.view?.kind === "list" ? panel.view : null)
	const wanted = $derived(view?.id ?? null)
	/** The id the data below was read for; undefined once the panel turned to another kind. */
	let readFor = $state<string | null | undefined>(undefined)
	let data = $state.raw<MoneyData | null>(null)
	let busy = $state(false)
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)
	let root = $state<HTMLElement | undefined>()

	/** The two-step _Confirm_ swap, shared with the ledger's Upcoming. */
	const steps = new TwoStep(() => root)

	const page = createPageState({
		fetch: async () => {
			const store = repo
			if (!store) return
			const id = untrack(() => wanted)
			data = await loadMoneyData(store, now)
			readFor = id
		},
		fallbackKey: "purchaseList.error.read",
		paint: () => {
			painted++
		},
	})

	const error = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	// Read the store again whenever the panel turns to another list, and when it comes back from
	// a card a step deeper, whose writes may have changed what the list holds room against.
	$effect(() => {
		const id = wanted
		const store = repo
		if (!view) {
			untrack(() => {
				readFor = undefined
			})
			return
		}
		if (!store) return
		untrack(() => {
			if (id === readFor && data) return
			steps.reset()
			page.clear()
			void page.load()
		})
	})

	const list = $derived(wanted !== null && data ? (data.lists.find((l) => l.id === wanted) ?? null) : null)

	// A list the store does not hold opens nothing, and leaves the address.
	$effect(() => {
		if (view && wanted !== null && readFor === wanted && data && !list && !startupFailure) untrack(() => panel.drop())
	})

	/** Runs a write; on success the page reads again and `then` runs, else the reason shows. */
	const write = async (action: (store: Repository) => Promise<void>, key: MessageKey, then = () => {}) => {
		const store = repo
		if (busy || !store) return
		busy = true
		let done = false
		await page.guard(async () => {
			await action(store)
			done = true
		}, key)
		busy = false
		if (!done) return
		onchange()
		then()
		if (panel.view?.kind === "list") await page.load()
	}

	const remove = (target: PurchaseList) =>
		write(
			(store) => deleteDraftList(store, target.id),
			"purchaseList.error.delete",
			() => panel.close({ ask: false }),
		)

	const merge = (target: PurchaseList) =>
		write((store) => mergeSameDayLists(store, target.id), "purchaseList.error.merge")

	const confirm = (target: PurchaseList) =>
		write(
			(store) => confirmWaitingList(store, target.id, clock()),
			"tx.error.confirmList",
			() => steps.reset(),
		)

	const ready = $derived(view !== null && data !== null && readFor === wanted && list !== null)

	/** The head: the list's date over its status and how many cards are on it. */
	const head = $derived.by((): { title: string; detail: string } => {
		void lang
		if (!list) return { title: "", detail: "" }
		const { cards } = listCount(list.lines)
		const count = t(cards === 1 ? "cards.page.count.one" : "cards.page.count.many", { count: cards })
		return {
			title: t("listPanel.title", { date: headerDate(list.date, getLocale(), true) }),
			detail: `${t(`tx.lists.status.${list.status}`)} · ${count}`,
		}
	})

	/** The lines, in the reader's language: each card, its note, and its figure or _Not made_. */
	const lines = $derived.by(() => {
		void lang
		if (!list || !data) return []
		const money = data
		const byId = new Map(money.cards.map((card) => [card.id, card]))
		const saved = list.status === "saved"
		return list.lines.map((line, index) => {
			const card = byId.get(line.cardId)
			const real = line.actual ?? line.amount
			return {
				key: `${line.cardId}:${index}`,
				cardId: line.cardId,
				last4: card?.last4,
				color: groupColor(card, money.groups) ?? undefined,
				label: cardLine(line.cardId, card, { short: true }),
				note: line.note,
				planned:
					saved && line.made && real !== line.amount
						? t("reply.planned", { amount: formatAmount(line.amount) })
						: undefined,
				amount: saved
					? line.made
						? formatAmount(real)
						: undefined
					: line.amount > 0
						? formatAmount(line.amount)
						: undefined,
				missing: saved ? t(list.movedTo ? "reply.moved" : "reply.notMade") : t("purchaseList.row.noAmount"),
			}
		})
	})

	/** A saved list's summary: how many purchases it saved, and their total. */
	const saved = $derived.by(() => {
		void lang
		if (list?.status !== "saved") return null
		const made = list.lines.filter((line) => line.made).length
		const total = formatAmount(listTotal(list))
		return made === 1 ? t("saved.summary.one", { total }) : t("saved.summary.many", { count: made, total })
	})

	const others = $derived(list && data && list.status !== "saved" ? mergeCandidates(list, data.lists).length : 0)

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		void (async () => {
			const opened = await open()
			if (!opened.ok) {
				startupFailure = opened.message
				return
			}
			repo = opened.repo
		})()
		return unsubscribe
	})
</script>

{#if view && (ready || startupFailure)}
	<DetailPanel title={head.title} detail={head.detail} onclose={() => panel.close()}>
		<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{#if list}
			{@const current = list}
			<div class="list-detail" bind:this={root}>
				{#if saved}
					<p class="note" data-tone="ok" data-place="start">{saved}</p>
				{/if}
				<section class="list-lines">
					<h3>{tr("listPanel.lines")}</h3>
					<div class="row-panel">
						{#each lines as line (line.key)}
							<button
								type="button"
								class="set-row"
								data-card={line.cardId}
								onclick={() => panel.deeper({ kind: "card", id: line.cardId })}>
								{#if line.last4 === undefined}
									<span class="mini" aria-hidden="true"></span>
								{:else}
									<span class="mini" data-g={line.color}>{line.last4}</span>
								{/if}
								<span class="set-row__text">
									<span>{line.label}</span>
									{#if line.planned}
										<small class="set-row__sub">{line.planned}</small>
									{/if}
									{#if line.note}
										<small class="set-row__sub">{line.note}</small>
									{/if}
								</span>
								{#if line.amount}
									<b class="list-amount" data-numeric>{line.amount}</b>
								{:else}
									<span class="list-missing">{line.missing}</span>
								{/if}
							</button>
						{/each}
						<div class="set-row list-total">
							<b>{tr("listPanel.total")}</b>
							<b class="list-amount" data-numeric>{formatAmount(listTotal(current))}</b>
						</div>
					</div>
				</section>
				{#if current.status !== "saved"}
					<div class="list-actions">
						{#if current.status === "draft"}
							<a class="btn" data-action="continue" href={listEditAddress(current.id)}>{tr("row.continue")}</a>
						{:else}
							<a class="btn" data-action="record-reply" href={listEditAddress(current.id)}>{tr("row.recordReply")}</a>
						{/if}
						{#if others > 0}
							<button
								type="button"
								data-variant="quiet"
								data-action="merge"
								disabled={busy}
								onclick={() => void merge(current)}>
								{others === 1 ? tr("row.merge.one") : tr("row.merge.many", { count: others })}
							</button>
						{/if}
						{#if current.status === "draft"}
							<button
								type="button"
								data-variant="danger"
								data-action="delete-draft"
								disabled={busy}
								onclick={() => void remove(current)}>
								{tr("common.delete")}
							</button>
						{:else}
							<TwoStepButtons {steps} kind="list" list={current} onconfirm={() => void confirm(current)} />
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</DetailPanel>
{/if}

<style>
	.list-detail {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}

	.list-lines {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-2);
	}

	.list-lines h3 {
		margin: 0;
		font-size: var(--cc-text-md);
		font-weight: 700;
	}

	/* Two classes, to outrank app.css's `.page .set-row`, which spreads the row's parts apart. */
	.list-lines .set-row {
		justify-content: flex-start;
	}

	.list-lines .set-row__text {
		flex: 1;
	}

	.list-amount {
		font-weight: 650;
		white-space: nowrap;
	}

	.list-missing {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
		white-space: nowrap;
	}

	.list-lines .list-total {
		justify-content: space-between;
	}

	/* The actions, in a row that wraps; a page is a link drawn as the primary button. */
	.list-actions {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--cc-space-2);
	}

	.list-actions a.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--cc-accent-text);
		text-decoration: none;
		background: var(--cc-accent);
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-sm);
	}

	.list-actions a.btn:hover {
		text-decoration: none;
		background: var(--cc-accent-hover);
	}
</style>
