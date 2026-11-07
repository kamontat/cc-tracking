<script lang="ts">
	import type { ListLine, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import ListElsewhere from "#components/organisms/ListElsewhere.svelte"
	import ListReply from "#components/organisms/ListReply.svelte"
	import { headerDate, today } from "#lib/domain/date"
	import { MessageError } from "#lib/i18n/error"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { listId, listPageAddress } from "#lib/ui/list-address"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { writeListReply } from "#lib/ui/save-list-reply"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The spender's reply to the waiting list named by the address's `id` (`/list/reply?id=`).
	 * Saving writes the purchases and the saved list, then leaves for the saved list's own page;
	 * *Cancel list* deletes the waiting list and goes Home. A list in any other state (or none)
	 * says so and links to where it can be opened. Everything here is the reader's data (DD-172).
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** The page's only clock reading: today's date, and when the reply is saved. */
		clock?: () => Date
		/** The address bar, read once for the list's `id`. */
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

	const now = today(clock())
	const id = listId(address.search())
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	// What the page shows: frozen once a write succeeds, so the page keeps the reply on its way
	// out rather than flash the list's new state before the next page opens.
	let shown = $state.raw<MoneyData | null>(null)
	let leaving = false
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

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
		if (cancelled) navigate("/")
	}

	const detail = $derived.by(() => {
		void lang
		return list ? t("reply.listFor", { date: headerDate(list.date, getLocale(), false) }) : ""
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

{#if shown && list?.status === "sent"}
	<SubHeaderBar title={tr("reply.title")} {detail} back="/" />
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
	<ListReply {list} cards={shown.cards} groups={shown.groups} onsavereply={saveReply}>
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
