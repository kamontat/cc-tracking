<script lang="ts">
	import type { Card, LimitGroup, LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import CardForm from "#components/organisms/CardForm.svelte"
	import { MessageError } from "#lib/i18n/error"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { cardAddress, editCardId } from "#lib/ui/card-form"
	import { cardTitle } from "#lib/ui/card-label"
	import { createPageState } from "#lib/ui/page-state"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The full-screen card form: `/card/new` and `/card/edit?id=<id>` share it under the compact
	 * sub-header -- *New card* back to Cards, or the stored card's title (`name · holder (last4)`,
	 * steady while the form is typed in) over *Card id can't change*, back to its page. A save
	 * replaces the address with the card's page; a failed one keeps the form and what was typed,
	 * with the reason in the form rather than the page's banner. A new card's id must not be
	 * stored already. Archive and Delete are on the card page's More menu. Everything here is the
	 * reader's data (PRD DD-172).
	 */
	interface Props {
		/** Which page: a new card, or the stored card the address names. */
		mode: "new" | "edit"
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** The address's query, read once the island is in the browser. */
		search?: () => string
		/** Leaves after a save; `location.replace`, so Back does not reopen the form. */
		navigate?: (url: string) => void
	}

	const {
		mode,
		open = () => openRepository(),
		search = () => browserBar().search(),
		navigate = (url: string) => location.replace(url),
	}: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let repo: Repository | null = null
	let cardId: string | null = null
	let card = $state.raw<Card | null>(null)
	let groups = $state.raw<LimitGroup[]>([])
	let locations = $state.raw<LocationRecord[]>([])
	let loaded = $state(false)
	let busy = $state(false)
	// The last write failed: its reason shows in the form rather than the page's banner.
	let writeFailed = $state(false)
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	/** Bumped after every load, so the banners re-read the page state's error. */
	let painted = $state(0)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const [nextGroups, nextLocations] = await Promise.all([repo.listLimitGroups(), repo.listLocations()])
			groups = nextGroups
			locations = nextLocations
			if (mode === "new") {
				loaded = true
				return
			}
			if (!cardId) throw new MessageError("card.error.noSelection")
			const stored = await repo.getCard(cardId)
			if (!stored) throw new MessageError("card.error.notFound", { id: cardId })
			card = stored
			loaded = true
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

	const showForm = $derived(loaded && (mode === "new" || card !== null))

	/** The sub-header: *New card*, else the stored card's title once it is read. */
	const header = $derived.by((): { title: string; detail?: string; back: string } => {
		void lang
		if (mode === "new") return { title: t("cards.page.new"), back: "/cards" }
		if (!card) return { title: t("cards.title"), back: "/cards" }
		return { title: cardTitle(card, groups), detail: t("form.idImmutable"), back: cardAddress(card.id) }
	})

	/** Runs a write; on success leaves for `to`, else keeps the form with the reason. */
	const write = async (action: (store: Repository) => Promise<void>, key: MessageKey, to: string) => {
		const store = repo
		if (busy || !store) return
		busy = true
		writeFailed = false
		let done = false
		await page.guard(async () => {
			await action(store)
			done = true
		}, key)
		busy = false
		if (done) {
			navigate(to)
			return
		}
		writeFailed = true
	}

	const onSave = (next: Card) =>
		write(
			async (store) => {
				if (mode === "new" && (await store.getCard(next.id))) {
					throw new MessageError("cards.error.duplicateId", { id: next.id })
				}
				await store.saveCard(next)
			},
			"cards.error.save",
			cardAddress(next.id),
		)

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		cardId = mode === "edit" ? editCardId(search()) : null
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

<SubHeaderBar title={header.title} detail={header.detail} back={header.back} />
{#if !writeFailed && !busy}
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
{/if}
{#if showForm}
	<CardForm
		{card}
		{groups}
		{locations}
		{busy}
		error={writeFailed ? error : ""}
		onsave={(next: Card) => void onSave(next)} />
{/if}
