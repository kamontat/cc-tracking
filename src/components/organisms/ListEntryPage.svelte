<script lang="ts">
	import type { GroupRoom } from "#lib/domain/room"
	import type { Card, ListLine, PlainDate, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { ShareApi } from "#lib/ui/list-share"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, tick } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import ListAmounts from "#components/organisms/ListAmounts.svelte"
	import ListElsewhere from "#components/organisms/ListElsewhere.svelte"
	import ListTable from "#components/organisms/ListTable.svelte"
	import { displayDate, headerDate, isValidDate, today } from "#lib/domain/date"
	import { isReady, readyRows, roomFor } from "#lib/domain/home"
	import { composeList, keptLines, lineAmount, listLines } from "#lib/domain/list-entry"
	import { formatAmountInput } from "#lib/domain/money"
	import { plannedOf } from "#lib/domain/pay"
	import { listCount, mergeLists } from "#lib/domain/purchase-list"
	import { messageOf } from "#lib/i18n/error"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { cardLines } from "#lib/ui/card-label"
	import {
		EDIT_LIST_ADDRESS,
		type ListSheet,
		legacyListAddress,
		listId,
		listKey,
		listPanelAddress,
		listSheetAddress,
		NEW_LIST_ADDRESS,
		newListAddress,
		readListSheet,
	} from "#lib/ui/list-address"
	import { browserShare, countWords, imageName, shareTable, shareText } from "#lib/ui/list-share"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { deleteDraftList, storedDraft } from "#lib/ui/row-actions"
	import { openRepository } from "#lib/ui/startup"
	import { LISTS_ADDRESS } from "#lib/ui/tx-query"

	/**
	 * The two steps of writing a purchase list: enter amounts (or keep it as a draft, amounts
	 * optional, DD-187), then review the table and mark it sent. Saving on a day that already has
	 * a list of the same kind asks first whether to merge into it. `new` starts from the address's
	 * `cards` (`/transactions/lists/new?cards=…`, RD-26), or none, and keeps them there as cards are
	 * added and removed; `draft` reopens the stored draft named by `list`
	 * (`/transactions/lists/edit?list=`), whose own lines hold no room. Everything typed lives
	 * here, so going back from the review loses nothing, and a failed save keeps the review on
	 * screen under the banner. A save leaves for the Lists tab with the list open in its panel
	 * (`/transactions/lists?list=<id>`); deleting the draft, for the Lists tab.
	 *
	 * The add-a-card sheet is not in the address: opening it pushes an entry with the address
	 * unchanged, so Back closes it; moving within it changes nothing in history; closing it steps
	 * back over its entry.
	 *
	 * `legacy` is the old pages' way (`/list/new?card=…`, `/list/draft?id=`, DD-195), until they
	 * retire: the sheet in the address (`add=1`, `open=<card>`) as `/pay`'s is (DD-76), opening
	 * it pushes an entry, moving within it rewrites that entry, closing steps back over it or
	 * rewrites it away when the page was opened on it; a write goes Home.
	 */
	interface Props {
		mode: "new" | "draft"
		/** The old `/list/new` and `/list/draft`: their keys, the sheet in the address, Home after a write. */
		legacy?: boolean
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
		legacy = false,
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
	// A save waiting on its answer: the day already has `count` lists of the kind it would be.
	let asking = $state.raw<{ list: { date: PlainDate; lines: ListLine[] }; send: boolean; count: number } | null>(null)
	let askRoot = $state<HTMLElement | undefined>()
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)
	/** The open add-a-card sheet: as the address has it on an old page, else in memory only. */
	let sheet = $state<ListSheet>(legacy ? readListSheet(search) : null)
	// Whether this page pushed the entry now showing: closing the sheet then steps back, so the
	// list is not in history twice. A sheet the page was opened on is rewritten away instead.
	let pushed = false
	let pickedOnce = false
	const path = legacy
		? mode === "new"
			? "/list/new"
			: "/list/draft"
		: mode === "new"
			? NEW_LIST_ADDRESS
			: EDIT_LIST_ADDRESS
	/** Where a write leaves for: the list's panel on the Lists tab, or with no list the tab itself. */
	const after = (id?: string) => (legacy ? "/" : id ? listPanelAddress(id) : LISTS_ADDRESS)
	const back = legacy ? "/" : LISTS_ADDRESS

	const readyCards = (from: MoneyData): Card[] =>
		from.cards.filter((card) => isReady(card, from.groups, from.locations))

	// Reads the address once, against the first data that loads.
	const start = (from: MoneyData) => {
		const ready = new Set(readyCards(from).map((card) => card.id))
		if (mode === "new") {
			cardIds = unique(new URLSearchParams(search).getAll(legacy ? "card" : "cards")).filter((c) => ready.has(c))
			view = "amounts"
			return
		}
		const id = legacy ? listId(search) : listKey(search)
		const list = from.lists.find((l) => l.id === id)
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
			// A draft's 0 is a card with no amount yet: its field opens blank.
			typed[line.cardId] = [...(typed[line.cardId] ?? []), line.amount > 0 ? formatAmountInput(line.amount) : ""]
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
		asking = null
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
		if (mode !== "new") return
		address.replace(legacy ? legacyListAddress(cardIds, address.search()) : newListAddress(cardIds))
	}

	/** Opens, moves or closes the add-a-card sheet, keeping history in step. */
	const onSheet = (next: ListSheet) => {
		if (!legacy) {
			if (next !== null && sheet === null) {
				pushed = true
				// The page's own entry: Back to the list must not have the router swap in a fresh page.
				address.push(`${path}${address.search()}`, { ownPage: true })
			} else if (next === null && sheet !== null && pushed) {
				pushed = false
				// The pop that follows closes the sheet.
				address.back()
				return
			}
			sheet = next
			return
		}
		if (next === null) {
			if (sheet === null) return
			if (pushed) {
				pushed = false
				// The pop that follows reads the address without the sheet.
				address.back()
				return
			}
			sheet = null
			address.replace(listSheetAddress(path, address.search(), null))
			return
		}
		if (sheet === null) {
			pushed = true
			pickedOnce = true
			// The page's own entry: Back to the list must not have the router swap in a fresh page.
			address.push(listSheetAddress(path, address.search(), next), { ownPage: true })
		} else {
			address.replace(listSheetAddress(path, address.search(), next))
		}
		sheet = next
	}

	const onEntryChange = (next: {
		date: PlainDate
		entries: Record<string, string[]>
		notes?: Record<string, string[]>
	}) => {
		date = next.date
		entries = { ...next.entries }
		notes = { ...next.notes }
		asking = null
	}

	/** What was typed, in satang by card; blank and not-money text read as 0. */
	const typedAmounts = () => {
		const out: Record<string, number[]> = {}
		for (const id of cardIds) out[id] = (entries[id] ?? []).map((text) => lineAmount(text) ?? 0)
		return out
	}

	const onReview = (next: { date: PlainDate }) => {
		date = next.date
		// Lines come from the cards on the list now: the typed amounts can still hold a key for a
		// card that was removed.
		reviewed = { date, lines: listLines(cardIds, typedAmounts(), notes) }
		show("review")
	}

	/** *Save as draft*, before the review: every card stays, with or without an amount. */
	const onDraft = (next: { date: PlainDate }) => {
		date = next.date
		void save({ date, lines: keptLines(cardIds, typedAmounts(), notes) }, false)
	}

	const onRemove = (cardId: string) => {
		cardIds = cardIds.filter((id) => id !== cardId)
		syncAddress()
	}

	const onAdd = (cardId: string) => {
		if (!cardIds.includes(cardId)) cardIds = [...cardIds, cardId]
		syncAddress()
	}

	/**
	 * The amounts step's cards, every ready card (the sheet's picker) and each one's room; a card
	 * no longer ready drops off and says so.
	 */
	const amounts = $derived.by(() => {
		if (!data) return null
		const from = data
		const rows = readyRows(from, now)
		const byId = new Map(rows.map((row) => [row.card.id, row.card]))
		const cards = cardIds.flatMap((id) => byId.get(id) ?? [])
		const rooms = new Map<string, GroupRoom>()
		for (const row of rows) {
			const room = roomFor(row.card, from, editingId)
			if (room) rooms.set(row.card.id, room)
		}
		return { rows, cards, rooms, gone: cardIds.filter((id) => !byId.has(id)) }
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

	/** The other lists on `on` of the kind this save makes: drafts, or lists waiting for the spender. */
	const sameDay = (lists: PurchaseList[], on: PlainDate, send: boolean) =>
		lists.filter((l) => l.id !== editingId && l.date === on && l.status === (send ? "sent" : "draft"))

	/**
	 * Saves `list` as a draft or sent. When the day already has a list of that kind, it asks first
	 * (`asking`); `merge` is the answer: true adds this list to the first of them, taking in the
	 * rest, and removes this draft if it was stored; false saves it on its own.
	 */
	const save = async (list: { date: PlainDate; lines: ListLine[] }, send: boolean, merge?: boolean) => {
		const store = repo
		if (!store || !data) return
		if (merge === undefined) {
			const count = sameDay(data.lists, list.date, send).length
			if (count > 0) {
				asking = { list, send, count }
				await tick()
				askRoot?.querySelector<HTMLElement>('[data-action="merge"]')?.focus()
				return
			}
		}
		asking = null
		let saved = false
		let landed: string | undefined
		await page.guard(
			async () => {
				if (editingId) await storedDraft(store, editingId)
				saveId ??= editingId ?? newId()
				const composed = composeList({
					id: saveId,
					date: list.date,
					lines: list.lines,
					send,
					now: clock().toISOString(),
				})
				const [into, ...rest] = merge ? sameDay(await store.listPurchaseLists(), list.date, send) : []
				if (!into) {
					await store.savePurchaseList(composed)
					landed = composed.id
				} else {
					landed = into.id
					// Written before anything goes, so a failure part-way leaves a line twice, never lost.
					await store.savePurchaseList(mergeLists(into, [composed, ...rest]))
					if (editingId) await store.deletePurchaseList(editingId)
					for (const other of rest) await store.deletePurchaseList(other.id)
				}
				saved = true
			},
			merge ? "purchaseList.error.merge" : "purchaseList.error.save",
		)
		if (saved) navigate(after(landed))
	}

	const askText = $derived.by(() => {
		void lang
		if (!asking) return ""
		const kind = asking.send ? "sent" : "draft"
		const params = { count: asking.count, date: displayDate(asking.list.date, getLocale()) }
		return t(asking.count === 1 ? `purchaseList.merge.${kind}.one` : `purchaseList.merge.${kind}.many`, params)
	})

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
		if (deleted) navigate(after())
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
		const removePop = address.onPop(
			() => {
				if (!legacy) {
					// Back over the sheet's entry closes it; Forward onto it leaves it closed.
					sheet = null
					pushed = false
					syncAddress()
					return
				}
				sheet = readListSheet(address.search())
				// Back onto the list, or Forward onto a sheet only this page could have pushed.
				pushed = pickedOnce && sheet !== null
				// The entry stepped onto may predate cards added since: keep its address up to date.
				syncAddress()
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

{#snippet mergeAsk()}
	{#if asking}
		<div class="merge-ask" data-merge-ask bind:this={askRoot}>
			<p>{askText}</p>
			<button type="button" data-action="merge" onclick={() => asking && save(asking.list, asking.send, true)}>
				{tr("purchaseList.merge")}
			</button>
			<button
				type="button"
				data-variant="quiet"
				data-action="keep-separate"
				onclick={() => asking && save(asking.list, asking.send, false)}>
				{tr("purchaseList.keepSeparate")}
			</button>
		</div>
	{/if}
{/snippet}

{#snippet amountsSide()}
	{@render mergeAsk()}
	{@render deleteButton()}
{/snippet}

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
		{back} />
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
	{#if droppedNote}
		<p class="note" data-dropped>{droppedNote}</p>
	{/if}
	<ListAmounts
		cards={amounts.cards}
		allCards={data.cards}
		groups={data.groups}
		planned={plannedOf(data.payments)}
		ready={amounts.rows}
		rooms={amounts.rooms}
		{sheet}
		onsheet={onSheet}
		ledgers={data.ledgers}
		today={now}
		{date}
		{entries}
		{notes}
		onentrychange={onEntryChange}
		onreview={onReview}
		ondraft={onDraft}
		onremove={onRemove}
		onadd={onAdd}
		side={amountsSide} />
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
			<button type="button" data-action="mark-sent" onclick={() => reviewed && save(reviewed, true)}>
				<SvgIcon name="send" />{tr("purchaseList.markSent")}
			</button>
			{@render mergeAsk()}
			{@render deleteButton()}
		</div>
	</div>
{:else}
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
{/if}

<style>
	/* The question before a save that could merge: its words, then Merge and Keep separate. */
	.merge-ask {
		display: grid;
		gap: var(--cc-space-2);
		padding: var(--cc-space-3);
		font-size: var(--cc-text-sm);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}
</style>
