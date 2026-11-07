<script lang="ts">
	import type { PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import ListElsewhere from "#components/organisms/ListElsewhere.svelte"
	import { addDays, headerDate, today } from "#lib/domain/date"
	import { formatAmount } from "#lib/domain/money"
	import { listTotal } from "#lib/domain/purchase-list"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { cardLine, cardLines, groupColor } from "#lib/ui/card-label"
	import { listId, listPageAddress } from "#lib/ui/list-address"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * A saved list, read-only (`/list/view?id=`): what was bought, at what real amount, and a link
	 * to the draft its unmade lines moved to. A list in any other state (or none) says so and links
	 * to where it can be opened. Everything here is the reader's data (PRD DD-172).
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar, read once for the list's `id`. */
		address?: AddressBar
	}

	const { open = () => openRepository(), clock = () => new Date(), address = browserBar() }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	const id = listId(address.search())
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const page = createPageState({
		fetch: async () => {
			if (repo) data = await loadMoneyData(repo, now)
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

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	const list = $derived(data?.lists.find((l) => l.id === id))

	/** The saved list's words, re-read on a language switch. */
	const view = $derived.by(() => {
		void lang
		if (!data || list?.status !== "saved") return null
		const saved: PurchaseList = list
		const locale = getLocale()
		const byId = new Map(data.cards.map((card) => [card.id, card]))
		const made = saved.lines.filter((line) => line.made).length
		const total = formatAmount(listTotal(saved))
		return {
			title: headerDate(saved.date, locale, true),
			summary: made === 1 ? t("saved.summary.one", { total }) : t("saved.summary.many", { count: made, total }),
			lines: saved.lines.map((line, index) => {
				const card = byId.get(line.cardId)
				const real = line.actual ?? line.amount
				return {
					key: `${line.cardId}:${index}`,
					cardId: line.cardId,
					last4: card?.last4,
					color: groupColor(card, data?.groups ?? []) ?? undefined,
					label: cardLine(line.cardId, card, { short: true }),
					planned:
						line.made && real !== line.amount ? t("reply.planned", { amount: formatAmount(line.amount) }) : undefined,
					note: line.note,
					amount: line.made ? formatAmount(real) : undefined,
				}
			}),
			moved: saved.movedTo
				? {
						href: listPageAddress({ id: saved.movedTo, status: "draft" }),
						says: t("saved.moved", {
							cards: cardLines(
								saved.lines.filter((line) => !line.made).map((line) => line.cardId),
								data.cards,
								{ short: true },
							),
							date: headerDate(addDays(saved.date, 1), locale, false),
						}),
					}
				: undefined,
		}
	})

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
			await page.load()
		})()
		return unsubscribe
	})
</script>

{#if view}
	<SubHeaderBar title={view.title} detail={tr("saved.detail")} back="/" />
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
	<div class="list-layout">
		<div class="list-layout__main">
			<ul class="saved-lines">
				{#each view.lines as line (line.key)}
					<li data-card={line.cardId}>
						<span class="what"
							><b
								><span class="card-panel"
									>{#if line.last4 === undefined}
										<span class="mini" aria-hidden="true"></span>
									{:else}
										<span class="mini" data-g={line.color}>{line.last4}</span>
									{/if}
									<span class="card-label">{line.label}</span></span
								></b
							>
							{#if line.planned}
								<small>{line.planned}</small>
							{/if}
							{#if line.note}
								<small class="line-note">{line.note}</small>
							{/if}</span
						>
						{#if line.amount}
							<b class="amount">{line.amount}</b>
						{:else}
							<span class="tag">{tr("reply.notMade")}</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
		<div class="list-layout__side">
			<p class="note" data-tone="ok" data-place="start">{view.summary}</p>
			{#if view.moved}
				<a data-action="open-draft" href={view.moved.href}>
					<b>{view.moved.says}</b>
					<small>{tr("saved.openDraft")}</small>
				</a>
			{/if}
		</div>
	</div>
{:else if data}
	<ListElsewhere {list} {error} onretry={onRetry} />
{:else}
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
{/if}
