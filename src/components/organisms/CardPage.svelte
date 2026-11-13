<script lang="ts">
	import type { Card, LedgerStatement, Purchase } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { MoreItem } from "#lib/ui/more-menu"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import MoreMenu from "#components/molecules/MoreMenu.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import CardHero from "#components/organisms/CardHero.svelte"
	import CardStatements from "#components/organisms/CardStatements.svelte"
	import PurchaseSheet from "#components/organisms/PurchaseSheet.svelte"
	import { canPurchase } from "#lib/domain/card"
	import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle"
	import { compareDates, today } from "#lib/domain/date"
	import { overRoom as overRoomOf, roomFor } from "#lib/domain/home"
	import { nextBill } from "#lib/domain/ledger"
	import { formatAmount } from "#lib/domain/money"
	import { openPeriod, recentPeriods } from "#lib/domain/statement"
	import { MessageError } from "#lib/i18n/error"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { cardTitle } from "#lib/ui/card-label"
	import { newListAddress } from "#lib/ui/list-address"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { payAddress } from "#lib/ui/pay-address"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The card page's island (prototype `vCard`): a compact sub-header -- the card's title, its id
	 * and where it is kept, *Edit*, and a *More* menu with *Archive card* / *Unarchive card* and,
	 * while the card can go, *Delete card* (asking twice; a delete lands on Cards) -- then the hero
	 * and stats, *Use on a list* and *Add purchase* (the purchase sheet over the page, staying on
	 * it after a save, and saying by how much a purchase went over the room) or why the card
	 * can't take one, *Make a payment*, and the statements, each unfolding to its purchases to fix
	 * (*Edit* in a sheet, *Delete* asking twice) and the payments that settled it. The card is
	 * `?id=` in the address (ENDPOINTS.md). Everything here is the reader's data (PRD DD-172).
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** The address's query; read once the page is in the browser. */
		search?: () => string
		/** Today's date, read once. */
		clock?: () => Date
		/** Leaves after a delete; `location.replace`, so Back does not reopen a card that is gone. */
		navigate?: (url: string) => void
	}

	const {
		open = () => openRepository(),
		search = () => browserBar().search(),
		clock = () => new Date(),
		navigate = (url: string) => location.replace(url),
	}: Props = $props()

	const PAGE_SIZE = 12

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	let repo: Repository | null = null
	let cardId: string | null = null
	let card = $state.raw<Card | null>(null)
	let purchases = $state.raw<Purchase[]>([])
	// Every card's ledger, not just this card's: a limit group is shared, so the room this card
	// has to spend depends on what its siblings owe too.
	let data = $state.raw<MoneyData | null>(null)
	let shown = $state(PAGE_SIZE)
	// The purchase open in the sheet, by id, so a reload hands the sheet its fresh copy.
	let editingId = $state<string | null>(null)
	let adding = $state(false)
	// Satang the last added purchase went over the room, said once under the hero (DR-11), until
	// the next write on the page (DD-126).
	let overRoom = $state(0)
	let busy = $state(false)
	// Whether *Delete card* is offered: no purchases, on no open list.
	let deletable = $state(false)
	// A More menu write (archive, delete) in flight, so a second press waits for it.
	let writing = $state(false)
	// Whether the open sheet's last save failed, so an older page error stays out of it.
	let sheetFailed = $state(false)
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	/**
	 * Whether a card may be deleted: no purchases, and on no draft and no list waiting for the
	 * spender. Storage refuses the rest anyway (`deleteCard`); this only hides the button.
	 */
	async function canDelete(store: Repository, id: string): Promise<boolean> {
		if ((await store.listPurchases(id)).length > 0) return false
		const lists = await store.listPurchaseLists()
		return !lists.some((list) => list.status !== "saved" && list.lines.some((line) => line.cardId === id))
	}

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			if (!cardId) throw new MessageError("card.error.noSelection")
			const found = await repo.getCard(cardId)
			if (!found) {
				card = null
				throw new MessageError("card.error.notFound", { id: cardId })
			}
			const money = await loadMoneyData(repo, now)
			const id = cardId
			deletable = await canDelete(repo, id)
			purchases = money.purchases.filter((entry) => entry.cardId === id)
			data = money
			card = found
		},
		fallbackKey: "card.error.read",
		paint: () => {
			painted++
		},
	})

	const error = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	// Counted back from the latest purchase when one is dated past today, so a purchase entered
	// ahead still has a statement on the page to edit or delete it from (DR-18).
	const latestDate = $derived(
		purchases.reduce((date, purchase) => (compareDates(purchase.date, date) > 0 ? purchase.date : date), now),
	)

	const statements = $derived.by((): LedgerStatement[] => {
		if (!card || !data) return []
		const current = card
		const ledger = data.ledgers.get(current.id)
		const openOne = openPeriod(current, now)
		return recentPeriods(current, latestDate, shown).map(
			(period): LedgerStatement =>
				ledger?.statements.find((entry) => entry.period === period) ?? {
					cardId: current.id,
					period,
					closeDate: closeDateOf(current.cycle, period),
					dueDate: dueDateOf(current.cycle, period),
					purchases: [],
					total: 0,
					paidAmount: 0,
					payments: [],
					remaining: 0,
					paid: false,
					open: period === openOne,
				},
		)
	})

	/** Whether a purchase sits in a period older than the oldest one on show. */
	const hasOlder = $derived.by(() => {
		if (!card) return false
		const current = card
		const oldest = recentPeriods(current, latestDate, shown).at(-1) ?? ""
		return purchases.some((purchase) => periodOfPurchase(current.cycle, purchase.date) < oldest)
	})

	const guard = (action: (store: Repository) => Promise<void>, key: MessageKey) => {
		const store = repo
		return store ? page.guard(() => action(store), key) : Promise.resolve()
	}

	const onDelete = (purchase: Purchase) => {
		overRoom = 0
		return guard((store) => store.deletePurchase(purchase.cardId, purchase.id), "card.error.deletePurchase")
	}

	// Editing is open to any purchase on the page, an archived card's included: it corrects
	// history rather than adding to it.
	const onEdit = (purchase: Purchase) => {
		editingId = purchase.id
		sheetFailed = false
		overRoom = 0
	}

	const onAdd = () => {
		adding = true
		sheetFailed = false
		overRoom = 0
	}

	const closeSheet = () => {
		if (busy) return
		editingId = null
		adding = false
		sheetFailed = false
		page.clear()
		painted++
	}

	// Closes the sheet only once the purchase is stored; a failure keeps it, with the reason. A
	// new purchase over the room is saved all the same, and the page then says by how much
	// (FR-19); an edit never does, since the room already counts the old amount (DR-11).
	const onSave = async (purchase: Purchase) => {
		if (busy) return
		busy = true
		sheetFailed = false
		const over = adding && card && data ? overRoomOf(card, data, purchase.amount) : 0
		let done = false
		await guard(
			async (store) => {
				await store.savePurchase(purchase)
				done = true
			},
			adding ? "card.error.addPurchase" : "card.error.editPurchase",
		)
		busy = false
		if (done) {
			editingId = null
			adding = false
			overRoom = over
		} else sheetFailed = true
	}

	/** Archives or unarchives the card in place; a failure says why in the banner. */
	const toggleArchive = async (current: Card) => {
		writing = true
		overRoom = 0
		await guard((store) => store.saveCard({ ...current, archived: !current.archived }), "cards.error.archive")
		writing = false
	}

	/** Deletes the card and leaves for Cards; a refusal stays, with storage's reason. */
	const deleteCard = async (current: Card) => {
		const store = repo
		if (!store) return
		writing = true
		overRoom = 0
		try {
			await store.deleteCard(current.id)
		} catch (failure) {
			await page.guard(() => Promise.reject(failure), "cards.error.delete")
			writing = false
			return
		}
		navigate("/cards")
	}

	const onMenu = (action: string) => {
		if (!card || writing) return
		if (action === "archive") void toggleArchive(card)
		else if (action === "delete") void deleteCard(card)
	}

	const menuItems = $derived.by((): MoreItem[] => {
		void lang
		if (!card) return []
		return [
			{ action: "archive", label: card.archived ? t("form.unarchive") : t("form.archive") },
			...(deletable
				? [
						{
							action: "delete",
							label: t("form.delete"),
							variant: "danger" as const,
							ask: t("form.deleteAsk", { name: card.name }),
						},
					]
				: []),
		]
	})

	/** Why this card is not offered on lists, or nothing when it is (FR-22). */
	const cannotPurchase = $derived.by((): { text: string; toLocations?: true } | null => {
		void lang
		if (!card) return null
		// An archived card takes no purchases wherever it is kept, so naming the place as the
		// reason would send the reader to the wrong setting.
		if (card.archived) return { text: t("card.archivedNote") }
		if (data && !canPurchase(card, data.locations))
			return {
				text: t("card.noPurchases", { location: nameOfLocation(data.locations, card.location) }),
				toLocations: true,
			}
		return null
	})

	const title = $derived.by(() => {
		void lang
		return card ? cardTitle(card, data?.groups ?? []) : t("cards.title")
	})

	const detail = $derived.by(() => {
		void lang
		return card
			? t("card.subtitle", { id: card.id, location: nameOfLocation(data?.locations ?? [], card.location) })
			: undefined
	})

	const ledger = $derived(card && data ? data.ledgers.get(card.id) : undefined)
	const next = $derived(ledger ? nextBill(ledger, now) : null)

	const badges = $derived.by(() => {
		void lang
		if (!card) return []
		return [card.archived ? t("cards.archived") : null, card.supplementary ? t("form.supplementary") : null].filter(
			(badge): badge is string => badge !== null,
		)
	})

	/** After a purchase went over the room: by how much, over which group (FR-19). */
	const overNote = $derived.by(() => {
		void lang
		const group = card ? data?.groups.find((g) => g.id === card?.limitGroupId) : undefined
		if (overRoom <= 0 || !group) return ""
		return t("card.overRoom", { over: formatAmount(overRoom), group: group.name })
	})

	const editing = $derived(editingId ? purchases.find((entry) => entry.id === editingId) : undefined)

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		cardId = new URLSearchParams(search()).get("id")
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

<SubHeaderBar {title} {detail} back="/cards" actions={card ? headerActions : undefined} />
<ErrorBanner message={sheetFailed || busy ? "" : error} retryLabel={tr("common.reload")} onretry={onRetry} />
{#if card && data}
	{@const current = card}
	{#if badges.length > 0}
		<p class="card-badges">
			{#each badges as badge (badge)}
				<span class="badge">{badge}</span>
			{/each}
		</p>
	{/if}
	<CardHero
		card={current}
		cards={data.cards}
		groups={data.groups}
		room={roomFor(current, data)}
		owed={ledger?.owed ?? 0}
		credit={ledger?.credit ?? 0}
		{next}
		today={now}
		locations={data.locations} />
	{#if current.comment}
		<p class="card-comment">{current.comment}</p>
	{/if}
	{#if overNote}
		<p class="card-over" role="status" data-over-room>{overNote}</p>
	{/if}
	<div class="card-actions">
		{#if cannotPurchase}
			<p class="note">{cannotPurchase.text}</p>
			{#if cannotPurchase.toLocations}
				<a class="btn" data-variant="quiet" data-action="settings" href="/settings/locations"
					>{tr("ready.toSettings")}</a
				>
			{/if}
		{:else}
			<a class="btn" data-action="use-on-list" href={newListAddress([current.id])}>{tr("card.useOnList")}</a>
			<button type="button" data-variant="quiet" data-action="add-purchase" onclick={onAdd}>
				{tr("card.purchase.add")}
			</button>
		{/if}
		<a
			class="btn"
			data-variant="quiet"
			data-action="pay"
			href={payAddress({ cardId: current.id, amount: next?.remaining ?? 0 })}
			>{tr("card.pay")}</a
		>
	</div>
	<section class="card-statements">
		<h2>{tr("card.statements")}</h2>
		<CardStatements
			{statements}
			today={now}
			oneditpurchase={({ purchase }) => onEdit(purchase)}
			ondeletepurchase={({ purchase }) => onDelete(purchase)} />
		{#if hasOlder}
			<button
				type="button"
				data-variant="quiet"
				data-action="show-older"
				onclick={() => {
					shown += PAGE_SIZE
				}}>
				{tr("card.showOlder")}
			</button>
		{/if}
	</section>
	{#if editing || adding}
		<PurchaseSheet
			card={current}
			groups={data.groups}
			purchase={editing ?? null}
			today={now}
			error={sheetFailed ? error : ""}
			{busy}
			onsave={onSave}
			onclose={closeSheet} />
	{/if}
{/if}

{#snippet headerActions()}
	{#if card}
		<a
			class="btn"
			data-variant="quiet"
			data-action="edit"
			href={`/card/edit?id=${encodeURIComponent(card.id)}`}
			aria-label={tr("card.edit")}
			>{tr("common.edit")}</a
		>
		<MoreMenu items={menuItems} busy={writing} onselect={onMenu} />
	{/if}
{/snippet}
