<script lang="ts">
	import type { PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { ShareApi } from "#lib/ui/list-share"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import ListElsewhere from "#components/organisms/ListElsewhere.svelte"
	import ListEntryPage from "#components/organisms/ListEntryPage.svelte"
	import ListReplyPage from "#components/organisms/ListReplyPage.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { listKey } from "#lib/ui/list-address"
	import { createPageState } from "#lib/ui/page-state"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The edit page's island (`/transactions/lists/edit?list=<id>`, PRD RD-26): it reads the list
	 * once and picks the page for its status, as a draft's _Continue_ and a waiting list's
	 * _Record reply_ expect: the builder on a draft (`ListEntryPage`), the spender's reply on a
	 * waiting list (`ListReplyPage`). A saved list has no edit page, so it says so and links to its
	 * panel; an unknown id (or none) says so and links to the Lists tab (`ListElsewhere`). The page
	 * it picks reads the store and the address itself, through the same opened store.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** The page's only clock reading, passed on. */
		clock?: () => Date
		/** The address bar, read once for `list`, and passed on. */
		address?: AddressBar
		/** Leaves after a write, passed on. */
		navigate?: (url: string) => void
		/** What this browser can do with the review's table, passed on. */
		share?: ShareApi
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		navigate = (url: string) => location.replace(url),
		share,
	}: Props = $props()

	/** The store, opened once for this page and the one it picks. */
	let opening: Promise<Opened> | null = null
	const openOnce = () => {
		opening ??= open()
		return opening
	}

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const id = untrack(() => listKey(address.search()))
	/** The stored list, once read; null when there is none by that id. */
	let list = $state.raw<PurchaseList | null | undefined>(undefined)
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)
	let read: () => Promise<void> = async () => {}

	const page = createPageState({
		fetch: () => read(),
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

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		void (async () => {
			const opened = await openOnce()
			if (!opened.ok) {
				startupFailure = opened.message
				return
			}
			const store = opened.repo
			read = async () => {
				list = (await store.listPurchaseLists()).find((l) => l.id === id) ?? null
			}
			await page.load()
		})()
		return unsubscribe
	})
</script>

{#if list?.status === "draft"}
	<ListEntryPage mode="draft" open={openOnce} {clock} {address} {navigate} {share} />
{:else if list?.status === "sent"}
	<ListReplyPage open={openOnce} {clock} {address} {navigate} />
{:else if list !== undefined}
	<ListElsewhere list={list ?? undefined} {error} onretry={onRetry} />
{:else}
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
{/if}
