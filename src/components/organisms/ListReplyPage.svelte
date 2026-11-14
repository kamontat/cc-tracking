<script lang="ts">
	import type { ListLine, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import ListElsewhere from "#components/organisms/ListElsewhere.svelte"
	import ListReply from "#components/organisms/ListReply.svelte"
	import { headerDate, today } from "#lib/domain/date"
	import { MessageError } from "#lib/i18n/error"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { EDIT_LIST_ADDRESS, listKey, listPageAddress } from "#lib/ui/list-address"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { writeListReply } from "#lib/ui/save-list-reply"
	import { openRepository } from "#lib/ui/startup"
	import { LISTS_ADDRESS } from "#lib/ui/tx-query"

	/**
	 * The spender's reply to the waiting list named by the address's `list`
	 * (`/transactions/lists/edit?list=`, RD-26). Saving writes the purchases and the saved list,
	 * then leaves for the Lists tab with the saved list open in its panel; *Cancel list* deletes the
	 * waiting list and leaves for the Lists tab. A list in any other state (or none) says so and
	 * links to where it can be opened. Everything here is the reader's data (DD-172).
	 *
	 * A card's sheet is not in the address, as the builder's is not: opening it pushes an entry
	 * with the address unchanged, so Back closes it; ‹ › within it change nothing in history;
	 * *Done* and Close step back over its entry.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** The page's only clock reading: today's date, and when the reply is saved. */
		clock?: () => Date
		/** The address bar, read once for the list's `list`. */
		address?: AddressBar
		/** Leaves after a write; `location.replace`, so Back does not reopen the list just written. */
		navigate?: (url: string) => void
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		navigate = (url: string) => location.replace(url),
	}: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = untrack(() => today(clock()))
	const id = untrack(() => listKey(address.search()))
	/** Where ‹ and a cancel lead: the Lists tab. */
	const home = LISTS_ADDRESS
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	// What the page shows: frozen once a write succeeds, so the page keeps the reply on its way
	// out rather than flash the list's new state before the next page opens.
	let shown = $state.raw<MoneyData | null>(null)
	let leaving = false
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)
	/** The card whose sheet is open, in memory only. */
	let sheet = $state<string | null>(null)
	// Whether this page pushed the entry now showing: closing the sheet then steps back, so the
	// reply is not in history twice.
	let pushed = false

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			data = await loadMoneyData(repo, now)
			if (!leaving) shown = data
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

	const list = $derived(shown?.lists.find((l) => l.id === id))

	/** Opens, moves or closes a card's sheet, keeping history in step. */
	const onSheet = (next: string | null) => {
		if (next !== null && sheet === null) {
			pushed = true
			// The page's own entry: Back to the reply must not have the router swap in a fresh page.
			address.push(`${EDIT_LIST_ADDRESS}${address.search()}`, { ownPage: true })
		} else if (next === null && sheet !== null && pushed) {
			pushed = false
			// The pop that follows closes the sheet.
			address.back()
			return
		}
		sheet = next
	}

	/** Writes the reply (`writeListReply`), then leaves for the saved list's own page. */
	const saveReply = async ({ lines, moveUnmade }: { lines: ListLine[]; moveUnmade: boolean }) => {
		const store = repo
		if (!store) return
		let saved: PurchaseList | undefined
		await page.guard(async () => {
			saved = await writeListReply(store, id ?? "", { lines, moveUnmade, now: clock() })
			leaving = true
		}, "reply.error.save")
		if (saved) navigate(listPageAddress(saved))
	}

	/**
	 * Deletes the waiting list at once, with no second step (DD-74), so it stops holding room;
	 * nothing was bought. A list no longer waiting (saved in another tab, say) is refused.
	 */
	const cancelList = async () => {
		const store = repo
		if (!store) return
		let cancelled = false
		await page.guard(async () => {
			const stored = (await store.listPurchaseLists()).find((l) => l.id === id)
			if (!stored) throw new MessageError("purchaseList.missing")
			if (stored.status !== "sent") throw new MessageError("reply.error.notWaiting")
			await store.deletePurchaseList(stored.id)
			cancelled = true
			leaving = true
		}, "reply.error.cancel")
		if (cancelled) navigate(home)
	}

	const detail = $derived.by(() => {
		void lang
		return list ? t("reply.listFor", { date: headerDate(list.date, getLocale(), false) }) : ""
	})

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		const removePop = address.onPop(
			() => {
				// Back over the sheet's entry closes it; Forward onto it leaves it closed.
				sheet = null
				pushed = false
			},
			{ ownPage: true },
		)
		void (async () => {
			const opened = await open()
			if (!opened.ok) {
				startupFailure = opened.message
				return
			}
			repo = opened.repo
			await page.load()
		})()
		return () => {
			unsubscribe()
			removePop()
		}
	})
</script>

{#if shown && list?.status === "sent"}
	<SubHeaderBar title={tr("reply.title")} {detail} back={home} />
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
	<ListReply {list} cards={shown.cards} groups={shown.groups} {sheet} onsheet={onSheet} onsavereply={saveReply}>
		{#snippet side()}
			<button type="button" data-variant="danger" data-action="cancel-list" onclick={cancelList}>
				{tr("reply.cancel")}
			</button>
		{/snippet}
	</ListReply>
{:else if shown}
	<ListElsewhere {list} {error} onretry={onRetry} />
{:else}
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
{/if}
