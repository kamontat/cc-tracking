<script lang="ts">
	import type { Card, CardPayment, LedgerStatement, Purchase } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { MoreItem } from "#lib/ui/more-menu"
	import type { PayDetail } from "#lib/ui/pay-form"
	import type { PanelView, RecordPanel } from "#lib/ui/record-panel.svelte"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import DetailPanel from "#components/molecules/DetailPanel.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import MoreMenu from "#components/molecules/MoreMenu.svelte"
	import CardForm from "#components/organisms/CardForm.svelte"
	import CardHero from "#components/organisms/CardHero.svelte"
	import CardStatements from "#components/organisms/CardStatements.svelte"
	import PayForm from "#components/organisms/PayForm.svelte"
	import PurchaseForm from "#components/organisms/PurchaseForm.svelte"
	import { canPurchase } from "#lib/domain/card"
	import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle"
	import { compareDates, today } from "#lib/domain/date"
	import { overRoom as overRoomOf, roomFor } from "#lib/domain/home"
	import { nextBill } from "#lib/domain/ledger"
	import { formatAmount, formatAmountInput } from "#lib/domain/money"
	import { payFigures } from "#lib/domain/pay"
	import { openPeriod, recentPeriods } from "#lib/domain/statement"
	import { MessageError } from "#lib/i18n/error"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardTitle, groupColor } from "#lib/ui/card-label"
	import { newListAddress } from "#lib/ui/list-address"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { savePayment } from "#lib/ui/record-payment"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The card panel (PRD RD-23, RD-24, DD-196): the card's page fitted to the detail panel, over
	 * whichever page holds `panel` (`?card=<id>`). The head is the card's chip, its title over its
	 * id and place, *Edit* and the *More* menu (*Archive card* / *Unarchive card*, and *Delete card*
	 * while it can go, asking twice). The body is the hero, the comment, the over-room note, *Use on
	 * a list* (or why the card takes no purchases), *Add purchase* and *Make a payment*, then the
	 * statements, newest first, with *Show older statements*.
	 *
	 * Each form takes the panel's place, with ‹ (and *Cancel*) back to the card, by the panel's
	 * form name: `edit` the card form, `pay` the payment form (on `arg` satang, else the next bill),
	 * `purchase` a purchase (`arg` the purchase to edit, else a new one), and `new` a blank card form
	 * with no card (_+ Add card_). A save returns to the card -- a new card's address written over
	 * its form's entry -- and a failed one keeps the form and what was typed, with the reason. Every
	 * write calls `onchange`, so the page behind reads its list again. A card the store does not
	 * hold opens nothing (`panel.drop`). It reads the store itself, so any page can hold it.
	 */
	interface Props {
		/** The page's panel: which record is open, and the way through history. */
		panel: RecordPanel
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** Makes a payment's id. */
		newId?: () => string
		/** A write landed: the page behind reads its records again. */
		onchange?: () => void
	}

	const {
		panel,
		open = () => openRepository(),
		clock = () => new Date(),
		newId = () => crypto.randomUUID(),
		onchange = () => {},
	}: Props = $props()

	const PAGE_SIZE = 12

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = untrack(() => today(clock()))
	let repo = $state.raw<Repository | null>(null)
	/** The card the panel asks for: its id, or null for a blank form (or no card panel at all). */
	const view = $derived(panel.view?.kind === "card" ? panel.view : null)
	const wanted = $derived(view?.id ?? null)
	/** The id the data below was read for. */
	let readFor = $state<string | null>(null)
	let card = $state.raw<Card | null>(null)
	// Every card's ledger, not just this card's: a limit group is shared, so the room this card
	// has to spend depends on what its siblings owe too.
	let data = $state.raw<MoneyData | null>(null)
	let deletable = $state(false)
	let shown = $state(PAGE_SIZE)
	// Satang the last added purchase went over the room, said once under the hero (DR-11), until
	// the next write (DD-126).
	let overRoom = $state(0)
	let busy = $state(false)
	// A More menu write (archive, delete) in flight, so a second press waits for it.
	let writing = $state(false)
	// Whether the open form's last save failed, so its reason shows in the form, not the banner.
	let formFailed = $state(false)
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
			const store = repo
			if (!store) return
			const id = untrack(() => wanted)
			const money = await loadMoneyData(store, now)
			const found = id === null ? null : (money.cards.find((entry) => entry.id === id) ?? null)
			deletable = found ? await canDelete(store, found.id) : false
			data = money
			card = found
			readFor = id
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

	// Read the store again whenever the panel turns to another card (or a blank form).
	$effect(() => {
		const id = wanted
		const store = repo
		if (!store || !view) return
		untrack(() => {
			if (id === readFor && data) return
			shown = PAGE_SIZE
			overRoom = 0
			formFailed = false
			page.clear()
			void page.load()
		})
	})

	// A card the store does not hold opens nothing, and leaves the address.
	$effect(() => {
		if (view && wanted !== null && readFor === wanted && data && !card && !startupFailure) untrack(() => panel.drop())
	})

	const purchases = $derived(card && data ? data.purchases.filter((entry) => entry.cardId === card?.id) : [])
	const ledger = $derived(card && data ? data.ledgers.get(card.id) : undefined)
	const next = $derived(ledger ? nextBill(ledger, now) : null)

	// Counted back from the latest purchase when one is dated past today, so a purchase entered
	// ahead still has a statement to edit or delete it from (DR-18).
	const latestDate = $derived(
		purchases.reduce((date, purchase) => (compareDates(purchase.date, date) > 0 ? purchase.date : date), now),
	)

	const statements = $derived.by((): LedgerStatement[] => {
		if (!card || !data) return []
		const current = card
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

	/** Runs a write; on success `then`, else the reason stays in the form (or the banner). */
	const write = async (
		action: (store: Repository) => Promise<void>,
		key: MessageKey,
		then: () => void,
		inForm = true,
	): Promise<void> => {
		const store = repo
		if (busy || !store) return
		busy = true
		formFailed = false
		let done = false
		await page.guard(async () => {
			await action(store)
			done = true
		}, key)
		busy = false
		if (done) {
			onchange()
			then()
		} else formFailed = inForm
	}

	/** Back to the card from a form, forgetting a failed save's reason. */
	const toCard = () => {
		formFailed = false
		page.clear()
		painted++
		panel.back()
	}

	const saveCard = (next: Card, isNew: boolean) =>
		write(
			async (store) => {
				if (isNew && (await store.getCard(next.id))) {
					throw new MessageError("cards.error.duplicateId", { id: next.id })
				}
				await store.saveCard(next)
			},
			"cards.error.save",
			() => (isNew ? panel.created({ kind: "card", id: next.id }) : panel.back()),
		)

	const savePurchase = (purchase: Purchase, isNew: boolean) => {
		const over = isNew && card && data ? overRoomOf(card, data, purchase.amount) : 0
		return write(
			(store) => store.savePurchase(purchase),
			isNew ? "card.error.addPurchase" : "card.error.editPurchase",
			() => {
				overRoom = over
				panel.back()
			},
		)
	}

	const pay = (detail: PayDetail) => {
		const current = card
		const loaded = data
		if (!current || !loaded) return
		const note = detail.note?.trim()
		const payment: CardPayment = {
			id: newId(),
			cardId: current.id,
			date: detail.date,
			amount: detail.amount,
			status: detail.date > now ? "planned" : "paid",
			...(note ? { note } : {}),
		}
		return write(
			(store) => savePayment(store, loaded, payment, now),
			"pay.error.save",
			() => panel.back(),
		)
	}

	const deletePurchase = (purchase: Purchase) => {
		overRoom = 0
		return write(
			(store) => store.deletePurchase(purchase.cardId, purchase.id),
			"card.error.deletePurchase",
			() => {},
			false,
		)
	}

	const onMenu = (action: string) => {
		const current = card
		if (!current || writing) return
		overRoom = 0
		writing = true
		const done = () => {
			writing = false
		}
		if (action === "archive")
			void write(
				(store) => store.saveCard({ ...current, archived: !current.archived }),
				"cards.error.archive",
				() => {},
				false,
			).then(done)
		else if (action === "delete")
			void write(
				(store) => store.deleteCard(current.id),
				"cards.error.delete",
				() => panel.close({ ask: false }),
				false,
			).then(done)
		else done()
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
	const cannotPurchase = $derived.by((): { text: string; toLocations?: { before: string; after: string } } | null => {
		void lang
		if (!card) return null
		if (card.archived) return { text: t("card.archivedNote") }
		// No stored limit group is invalid data (RD-27): not offered, and nothing said about it.
		if (data && !roomFor(card, data)) return { text: "" }
		if (data && !canPurchase(card, data.locations)) {
			// The note's "Settings › Locations" is the link itself, cut out of the sentence at {link}.
			const location = nameOfLocation(data.locations, card.location)
			const [before = "", after = ""] = t("card.noPurchasesLinked", { location, link: "\u0001" }).split("\u0001")
			return { text: t("card.noPurchases", { location }), toLocations: { before, after } }
		}
		return null
	})

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

	/** The open form, by name; a purchase form names its purchase, or none for a new one. */
	const form = $derived(view?.form ?? null)
	const editing = $derived(
		form?.name === "purchase" && form.arg ? purchases.find((entry) => entry.id === form.arg) : undefined,
	)

	/** Whether what the panel asks for is read and can be drawn. */
	const ready = $derived(view !== null && data !== null && readFor === wanted && (wanted === null || card !== null))

	/** The head: the record's name, or the form's over the card's. */
	const head = $derived.by((): { title: string; detail?: string; back: boolean } => {
		void lang
		if (!view) return { title: "", back: false }
		if (view.id === null) return { title: t("cards.page.new"), back: false }
		const name = card && data ? cardTitle(card, data.groups, data.owners) : view.id
		if (!form) {
			const detail =
				card && data ? t("card.subtitle", { id: card.id, location: nameOfLocation(data.locations, card.location) }) : ""
			return { title: name, detail, back: false }
		}
		const titles: Record<string, MessageKey> = { edit: "card.edit", pay: "pay.title", purchase: "card.purchase.add" }
		const key = form.name === "purchase" && form.arg ? "card.purchase.edit" : (titles[form.name] ?? "card.edit")
		return { title: t(key), detail: name, back: true }
	})

	/** The pay form's starting amount: the one asked for, else the next bill. */
	const payStart = $derived.by(() => {
		if (!ledger) return ""
		const asked = form?.name === "pay" && form.arg && /^\d+$/.test(form.arg) ? Number(form.arg) : 0
		const bill = payFigures(ledger, now).nextBill
		const start = asked > 0 ? asked : bill
		return start > 0 ? formatAmountInput(start) : ""
	})

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	const formKey = (current: PanelView) => `${current.id ?? ""}:${current.form?.name ?? ""}:${current.form?.arg ?? ""}`

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
	{@const current = view}
	<DetailPanel
		title={head.title}
		detail={head.detail}
		lead={card && !form ? lead : undefined}
		actions={card && !form ? actions : undefined}
		onback={head.back ? toCard : undefined}
		backLabel={head.back && card ? tr("panel.backToRecord", { name: card.name }) : undefined}
		onclose={() => panel.close()}
		ontouch={() => panel.touch()}
		form={form !== null || current.id === null}>
		{#if !formFailed && !busy}
			<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{/if}
		{#if data}
			{#key formKey(current)}
				{#if current.id === null}
					<CardForm
						card={null}
						groups={data.groups}
						owners={data.owners}
						locations={data.locations}
						{busy}
						error={formFailed ? error : ""}
						onsave={(next: Card) => void saveCard(next, true)} />
				{:else if card && form?.name === "edit"}
					<CardForm
						{card}
						groups={data.groups}
						owners={data.owners}
						locations={data.locations}
						{busy}
						error={formFailed ? error : ""}
						onsave={(next: Card) => void saveCard(next, false)}
						oncancel={toCard} />
				{:else if card && form?.name === "pay" && ledger}
					<PayForm
						{card}
						groups={data.groups}
						figures={payFigures(ledger, now)}
						today={now}
						amount={payStart}
						error={formFailed ? error : ""}
						{busy}
						onpay={(detail: PayDetail) => void pay(detail)}
						oncancel={toCard} />
				{:else if card && form?.name === "purchase"}
					<PurchaseForm
						{card}
						groups={data.groups}
						purchase={editing ?? null}
						today={now}
						error={formFailed ? error : ""}
						{busy}
						onsave={(purchase: Purchase) => void savePurchase(purchase, !editing)}
						oncancel={toCard} />
				{:else if card}
					{@render summary(card, data)}
				{/if}
			{/key}
		{/if}
	</DetailPanel>
{/if}

{#snippet lead()}
	{#if card && data}
		<span class="mini" data-g={groupColor(card, data.groups) ?? undefined}>{card.last4}</span>
	{/if}
{/snippet}

{#snippet actions()}
	{#if card}
		<button
			type="button"
			data-variant="quiet"
			data-action="edit"
			aria-label={tr("card.edit")}
			onclick={() => {
				overRoom = 0
				panel.openForm({ name: "edit" })
			}}>
			{tr("common.edit")}
		</button>
		<MoreMenu items={menuItems} busy={writing} onselect={onMenu} />
	{/if}
{/snippet}

{#snippet summary(current: Card, money: MoneyData)}
	<div class="card-detail">
		{#if badges.length > 0}
			<p class="card-badges">
				{#each badges as badge (badge)}
					<span class="badge">{badge}</span>
				{/each}
			</p>
		{/if}
		<CardHero
			card={current}
			cards={money.cards}
			groups={money.groups}
			owners={money.owners}
			room={roomFor(current, money)}
			owed={ledger?.owed ?? 0}
			credit={ledger?.credit ?? 0}
			{next}
			today={now}
			locations={money.locations} />
		{#if current.comment}
			<p class="card-comment">{current.comment}</p>
		{/if}
		{#if overNote}
			<p class="card-over" role="status" data-over-room>{overNote}</p>
		{/if}
		{#if cannotPurchase?.text}
			<!-- Why the card isn't offered on lists, with the way to change it as a link in the note,
			     so the actions below stay buttons of one size: Pay alone, full width. -->
			<p class="note card-note">
				{#if cannotPurchase.toLocations}
					{cannotPurchase.toLocations.before}<a data-action="settings" href="/settings?panel=locations"
						>{tr("card.locationsLink")}</a
					>{cannotPurchase.toLocations.after}
				{:else}
					{cannotPurchase.text}
				{/if}
			</p>
		{/if}
		<div class="card-actions">
			{#if !cannotPurchase}
				<a class="btn" data-action="use-on-list" href={newListAddress([current.id])}>{tr("card.useOnList")}</a>
				<button
					type="button"
					data-variant="quiet"
					data-action="add-purchase"
					onclick={() => {
						overRoom = 0
						panel.openForm({ name: "purchase" })
					}}>
					{tr("card.purchase.add")}
				</button>
			{/if}
			<button
				type="button"
				data-variant="quiet"
				data-action="pay"
				onclick={() => {
					overRoom = 0
					panel.openForm({ name: "pay" })
				}}>
				{tr("card.pay")}
			</button>
		</div>
		<section class="card-statements">
			<h2>{tr("card.statements")}</h2>
			<CardStatements
				{statements}
				today={now}
				oneditpurchase={({ purchase }) => {
					overRoom = 0
					panel.openForm({ name: "purchase", arg: purchase.id })
				}}
				ondeletepurchase={({ purchase }) => deletePurchase(purchase)} />
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
	</div>
{/snippet}
