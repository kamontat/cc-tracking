<script lang="ts">
	import type { GroupRoom } from "#lib/domain/room"
	import type { Card, ListLine, PlainDate, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { ShareApi } from "#lib/ui/list-share"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import ListAmounts from "#components/organisms/ListAmounts.svelte"
	import ListElsewhere from "#components/organisms/ListElsewhere.svelte"
	import ListTable from "#components/organisms/ListTable.svelte"
	import { headerDate, isValidDate, today } from "#lib/domain/date"
	import { isReady, roomFor } from "#lib/domain/home"
	import { composeList, lineAmount, listLines } from "#lib/domain/list-entry"
	import { formatAmountInput } from "#lib/domain/money"
	import { plannedOf } from "#lib/domain/pay"
	import { listCount } from "#lib/domain/purchase-list"
	import { messageOf } from "#lib/i18n/error"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { cardLines } from "#lib/ui/card-label"
	import { listId, newListAddress } from "#lib/ui/list-address"
	import { browserShare, countWords, imageName, shareTable, shareText } from "#lib/ui/list-share"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { deleteDraftList, storedDraft } from "#lib/ui/row-actions"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The two steps of writing a purchase list: enter amounts, then review the table and mark it
	 * sent or keep it as a draft. `new` starts from the address's `card` parameters
	 * (`/list/new?card=…`); `draft` reopens the stored draft named by `id` (`/list/draft?id=`),
	 * whose own lines hold no room. Everything typed lives here, so going back from the review
	 * loses nothing, and a failed save keeps the review on screen under the banner.
	 */
	interface Props {
		mode: "new" | "draft"
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** The page's only clock reading: today's date, and when a list is marked sent. */
		clock?: () => Date
		/** The address bar: read once, and a new list's cards rewritten into it. */
		address?: AddressBar
		/** Leaves after a write; `location.replace`, so Back does not reopen the list just written. */
		navigate?: (url: string) => void
		/** What this browser can do with the review's table. */
		share?: ShareApi
		/** The id a new list is stored under. */
		newId?: () => string
	}

	const {
		mode,
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		navigate = (url: string) => location.replace(url),
		share = browserShare(),
		newId = () => crypto.randomUUID(),
	}: Props = $props()

	/** `elsewhere` is a draft page opened on an id that is not stored, or not a draft. */
	type View = "loading" | "amounts" | "review" | "elsewhere"

	/** How the last Copy text or Save image went, kept raw so it re-translates on a switch. */
	type ShareStatus =
		| { kind: "copied" }
		| { kind: "copy-failed" }
		| { kind: "image-saved" }
		| { kind: "image-shared" }
		| { kind: "image-failed"; failure: unknown }

	const unique = (ids: string[]): string[] => [...new Set(ids)]

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const search = address.search()
	const now = today(clock())
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	let view = $state<View>("loading")
	// The stored draft being edited, if any; its id is kept and its own lines hold no room.
	let editingId = $state<string | undefined>(undefined)
	// What a draft page found instead of a draft: nothing, or a list in another state.
	let elsewhere = $state.raw<PurchaseList | undefined>(undefined)
	// The id this page saves under, fixed on the first save so a retry overwrites, not doubles.
	let saveId: string | undefined
	let cardIds = $state.raw<string[]>([])
	// Cards a reopened draft (or this page) had that can no longer take purchases, left out.
	let dropped = $state.raw<string[]>([])
	let date = $state<PlainDate>(now)
	// What was typed, by card, one text per order.
	let entries = $state.raw<Record<string, string[]>>({})
	let notes = $state.raw<Record<string, string[]>>({})
	let reviewed = $state.raw<{ date: PlainDate; lines: ListLine[] } | null>(null)
	let status = $state.raw<ShareStatus | null>(null)
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const readyCards = (from: MoneyData): Card[] =>
		from.cards.filter((card) => isReady(card, from.groups, from.locations))

	// Reads the address once, against the first data that loads.
	const start = (from: MoneyData) => {
		const ready = new Set(readyCards(from).map((card) => card.id))
		if (mode === "new") {
			cardIds = unique(new URLSearchParams(search).getAll("card")).filter((c) => ready.has(c))
			view = "amounts"
			return
		}
		const list = from.lists.find((l) => l.id === listId(search))
		if (list?.status !== "draft") {
			elsewhere = list
			view = "elsewhere"
			return
		}
		editingId = list.id
		date = list.date
		const onList = unique(list.lines.map((line) => line.cardId))
		const kept = onList.filter((c) => ready.has(c))
		cardIds = kept
		dropped = onList.filter((c) => !ready.has(c))
		// Each of a card's lines is one of its orders, in the order stored.
		const typed: Record<string, string[]> = {}
		const noted: Record<string, string[]> = {}
		for (const line of list.lines) {
			if (!kept.includes(line.cardId)) continue
			typed[line.cardId] = [...(typed[line.cardId] ?? []), formatAmountInput(line.amount)]
			noted[line.cardId] = [...(noted[line.cardId] ?? []), line.note ?? ""]
		}
		entries = typed
		notes = noted
		view = "amounts"
	}

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const loaded = await loadMoneyData(repo, now)
			data = loaded
			if (view === "loading") start(loaded)
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

	const show = (next: View) => {
		view = next
		status = null
	}

	/** The sub-header's muted line: the list's date and how many cards (and orders) are on it. */
	const subtitle = (count: { cards: number; orders: number }, on: PlainDate): string | undefined => {
		void lang
		return isValidDate(on)
			? countWords("purchaseList.subtitle", count, { date: headerDate(on, getLocale(), true) })
			: undefined
	}

	/** The amounts step's count: every card on the list, and every order typed or opened on it. */
	const entryCount = (ids: string[]) => ({
		cards: ids.length,
		orders: ids.reduce((n, id) => n + Math.max(1, entries[id]?.length ?? 0, notes[id]?.length ?? 0), 0),
	})

	// A new list's address names its cards, so a reload or shared link shows the same ones; a
	// draft's cards come from the stored draft, so its address stays as it is.
	const syncAddress = () => {
		if (mode === "new") address.replace(newListAddress(cardIds, search))
	}

	const onEntryChange = (next: {
		date: PlainDate
		entries: Record<string, string[]>
		notes?: Record<string, string[]>
	}) => {
		date = next.date
		entries = { ...next.entries }
		notes = { ...next.notes }
	}

	const onReview = (next: { date: PlainDate }) => {
		date = next.date
		// Lines come from the cards on the list now: the typed amounts can still hold a key for a
		// card that was removed.
		const amounts: Record<string, number[]> = {}
		for (const id of cardIds) amounts[id] = (entries[id] ?? []).map((text) => lineAmount(text) ?? 0)
		reviewed = { date, lines: listLines(cardIds, amounts, notes) }
		show("review")
	}

	const onRemove = (cardId: string) => {
		cardIds = cardIds.filter((id) => id !== cardId)
		syncAddress()
	}

	const onAdd = (cardId: string) => {
		if (!cardIds.includes(cardId)) cardIds = [...cardIds, cardId]
		syncAddress()
	}

	/** The amounts step's cards and their room; a card no longer ready drops off and says so. */
	const amounts = $derived.by(() => {
		if (!data) return null
		const from = data
		const ready = readyCards(from)
		const byId = new Map(ready.map((card) => [card.id, card]))
		const cards = cardIds.flatMap((id) => byId.get(id) ?? [])
		const rooms = new Map<string, GroupRoom>()
		for (const card of cards) {
			const room = roomFor(card, from, editingId)
			if (room) rooms.set(card.id, room)
		}
		return { ready, cards, rooms, gone: cardIds.filter((id) => !byId.has(id)) }
	})

	// A card that stopped being ready since the page opened leaves the list, and says so.
	$effect(() => {
		const gone = amounts?.gone ?? []
		if (gone.length === 0) return
		dropped = unique([...dropped, ...gone])
		cardIds = cardIds.filter((id) => !gone.includes(id))
	})

	const droppedNote = $derived.by(() => {
		void lang
		if (!data || dropped.length === 0) return ""
		return t(dropped.length === 1 ? "purchaseList.dropped.one" : "purchaseList.dropped.many", {
			cards: cardLines(dropped, data.cards),
		})
	})

	const table = () => (reviewed && data ? shareTable(reviewed, data.cards) : null)

	const copy = async () => {
		const words = table()
		if (!share.copy || !words) return
		try {
			await share.copy(shareText(words))
			status = { kind: "copied" }
		} catch {
			status = { kind: "copy-failed" }
		}
	}

	const saveImage = async () => {
		const words = table()
		if (!share.saveImage || !words || !reviewed) return
		try {
			const outcome = await share.saveImage(words, imageName(reviewed.date))
			// Closing the share sheet is the reader changing their mind, not a failure.
			status = outcome === "cancelled" ? null : { kind: outcome === "shared" ? "image-shared" : "image-saved" }
		} catch (failure) {
			status = { kind: "image-failed", failure }
		}
	}

	const save = async (send: boolean) => {
		const list = reviewed
		const store = repo
		if (!list || !store) return
		let saved = false
		await page.guard(async () => {
			if (editingId) await storedDraft(store, editingId)
			saveId ??= editingId ?? newId()
			await store.savePurchaseList(
				composeList({ id: saveId, date: list.date, lines: list.lines, send, now: clock().toISOString() }),
			)
			saved = true
		}, "purchaseList.error.save")
		if (saved) navigate("/")
	}

	/**
	 * Deletes the stored draft at once, with no second step (DD-74): it holds nothing that was
	 * bought. A draft sent or saved since is refused, like a save.
	 */
	const deleteDraft = async () => {
		const id = editingId
		const store = repo
		if (!id || !store) return
		let deleted = false
		await page.guard(async () => {
			await deleteDraftList(store, id)
			deleted = true
		}, "purchaseList.error.delete")
		if (deleted) navigate("/")
	}

	const statusText = $derived.by(() => {
		void lang
		if (!status) return ""
		switch (status.kind) {
			case "copied":
				return t("purchaseList.copied")
			case "copy-failed":
				return t("backup.error.copy")
			case "image-saved":
				return t("purchaseList.imageSaved")
			case "image-shared":
				return t("purchaseList.imageShared")
			case "image-failed":
				return messageOf(status.failure, "purchaseList.error.image")
		}
		return ""
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

{#snippet deleteButton()}
	{#if editingId}
		<button type="button" data-variant="danger" data-action="delete-draft" onclick={deleteDraft}>
			{tr("purchaseList.deleteDraft")}
		</button>
	{/if}
{/snippet}

{#if view === "elsewhere"}
	<ListElsewhere list={elsewhere} {error} onretry={onRetry} />
{:else if data && amounts && view === "amounts"}
	<SubHeaderBar
		title={tr(editingId ? "purchaseList.draft" : "purchaseList.new")}
		detail={subtitle(entryCount(amounts.cards.map((card) => card.id)), date)}
		back={mode === "new" ? "/list/new" : "/"} />
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
	{#if droppedNote}
		<p class="note" data-dropped>{droppedNote}</p>
	{/if}
	<ListAmounts
		cards={amounts.cards}
		allCards={data.cards}
		groups={data.groups}
		planned={plannedOf(data.payments)}
		candidates={amounts.ready.filter((card) => !cardIds.includes(card.id))}
		rooms={amounts.rooms}
		ledgers={data.ledgers}
		today={now}
		{date}
		{entries}
		{notes}
		onentrychange={onEntryChange}
		onreview={onReview}
		onremove={onRemove}
		onadd={onAdd}
		side={editingId ? deleteButton : undefined} />
{:else if data && view === "review"}
	<SubHeaderBar
		title={tr("purchaseList.reviewTitle")}
		detail={reviewed ? subtitle(listCount(reviewed.lines), reviewed.date) : undefined}
		back={() => show("amounts")} />
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
	<div class="list-layout">
		<div class="list-layout__main">
			<ListTable list={reviewed ?? { date, lines: [] }} cards={data.cards} />
		</div>
		<div class="list-layout__side">
			{#if share.copy || share.saveImage}
				<div class="list-share">
					{#if share.copy}
						<button type="button" data-variant="quiet" data-action="copy" onclick={copy}>
							<SvgIcon name="copy" />{tr("backup.copy")}
						</button>
					{/if}
					{#if share.saveImage}
						<button type="button" data-variant="quiet" data-action="save-image" onclick={saveImage}>
							<SvgIcon name="image" />{tr("purchaseList.saveImage")}
						</button>
					{/if}
				</div>
			{/if}
			<p
				class="status"
				role="status"
				data-failed={status?.kind === "copy-failed" || status?.kind === "image-failed" ? "" : undefined}>
				{statusText}
			</p>
			<p class="note">{tr("purchaseList.sendHint")}</p>
			<button type="button" data-action="mark-sent" onclick={() => save(true)}>
				<SvgIcon name="send" />{tr("purchaseList.markSent")}
			</button>
			<button type="button" data-variant="quiet" data-action="save-draft" onclick={() => save(false)}>
				{tr("purchaseList.saveDraft")}
			</button>
			{@render deleteButton()}
		</div>
	</div>
{:else}
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
{/if}
