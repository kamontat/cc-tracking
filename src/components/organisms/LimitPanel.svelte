<script lang="ts">
	import type { Card, LimitGroup } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { RecordPanel } from "#lib/ui/record-panel.svelte"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import DetailPanel from "#components/molecules/DetailPanel.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import GroupForm from "#components/organisms/GroupForm.svelte"
	import { groupPanels } from "#lib/domain/cards-view"
	import { today } from "#lib/domain/date"
	import { toGroupColor } from "#lib/domain/group-color"
	import { formatAmount } from "#lib/domain/money"
	import { ownerName, ownerOf } from "#lib/domain/owner"
	import { groupRoom } from "#lib/domain/room"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, groupColor } from "#lib/ui/card-label"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The limit panel (PRD RD-23, RD-24): a limit group in the detail panel, over whichever page
	 * holds `panel` (`?limit=<id>`). The head is the group's colour, its name over its holder and
	 * how many cards draw on it, and *Edit*. The body is the room, what is used of the limit, the
	 * bar in the tiles' rail colours with `N% used` (and *getting full* from 80%, or *over limit*),
	 * then its cards as a row list, archived ones included, each opening that card's panel a step
	 * deeper (`panel.deeper`), so Back returns here.
	 *
	 * *Edit* puts the group form in the panel's place (form `edit`), with ‹ and *Cancel* back to the
	 * group; a group no card uses can be deleted there, which closes the panel. A blank form (form
	 * `new`, no id: _+ Add limit_) adds a group, whose address is then written over the form's entry.
	 * A failed save keeps the form and what was typed, with the reason. Every write calls
	 * `onchange`, so the page behind reads its list again. A group the store does not hold opens
	 * nothing (`panel.drop`). It reads the store itself, so any page can hold it.
	 */
	interface Props {
		/** The page's panel: which record is open, and the way through history. */
		panel: RecordPanel
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** Makes a new group's id. */
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

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = untrack(() => today(clock()))
	let repo = $state.raw<Repository | null>(null)
	/** The group the panel asks for: its id, or null for a blank form (or no limit panel at all). */
	const view = $derived(panel.view?.kind === "limit" ? panel.view : null)
	const wanted = $derived(view?.id ?? null)
	/** The id the data below was read for; undefined once the panel turned to another kind. */
	let readFor = $state<string | null | undefined>(undefined)
	let data = $state.raw<MoneyData | null>(null)
	let busy = $state(false)
	// Whether the open form's last save failed, so its reason shows in the form, not the banner.
	let formFailed = $state(false)
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)
	// A new group's id, made once when its form opens, so a retry after a failed save writes the
	// same record rather than a second one.
	let pendingId: string | null = null

	const page = createPageState({
		fetch: async () => {
			const store = repo
			if (!store) return
			const id = untrack(() => wanted)
			data = await loadMoneyData(store, now)
			readFor = id
		},
		fallbackKey: "limits.error.read",
		paint: () => {
			painted++
		},
	})

	const error = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	// Read the store again whenever the panel turns to another group (or a blank form), and when it
	// comes back from another kind (a card a step deeper), whose writes may have moved a card.
	$effect(() => {
		const id = wanted
		const store = repo
		if (!view) {
			untrack(() => {
				readFor = undefined
				pendingId = null
			})
			return
		}
		if (!store) return
		untrack(() => {
			if (id === null) pendingId ??= newId()
			else pendingId = null
			if (id === readFor && data) return
			formFailed = false
			page.clear()
			void page.load()
		})
	})

	const group = $derived(wanted !== null && data ? (data.groups.find((g) => g.id === wanted) ?? null) : null)

	// A group the store does not hold opens nothing, and leaves the address.
	$effect(() => {
		if (view && wanted !== null && readFor === wanted && data && !group && !startupFailure) untrack(() => panel.drop())
	})

	/** The group's cards, by id, archived included. */
	const cards = $derived.by((): Card[] => {
		if (!group || !data) return []
		const id = group.id
		return data.cards.filter((c) => c.limitGroupId === id).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	})

	/** The group's figures, as its panel on the list shows them. */
	const figures = $derived.by(() => {
		if (!group || !data) return null
		const money = data
		const rooms = new Map([[group.id, groupRoom(group, money.cards, money.ledgers, money.lists, "")]])
		return groupPanels([group], money.cards, rooms)[0] ?? null
	})

	/** The bar's tint, as a card tile's rail: over below zero room, high from 80%, else within. */
	const level = $derived(!figures ? "within" : figures.room < 0 ? "over" : figures.full ? "high" : "within")

	const note = $derived.by(() => {
		void lang
		if (!figures) return ""
		if (level === "over") return t("cards.page.over")
		const used = t("cards.page.used", { pct: figures.usedPct })
		return level === "high" ? `${used} · ${t("cards.group.full")}` : used
	})

	/** Runs a write; on success `then`, else the reason stays in the form. */
	const write = async (action: (store: Repository) => Promise<void>, key: MessageKey, then: () => void) => {
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
		} else formFailed = true
	}

	/** Back to the group from its form, forgetting a failed save's reason. */
	const toGroup = () => {
		formFailed = false
		page.clear()
		painted++
		panel.back()
	}

	const save = (next: LimitGroup) => {
		const id = pendingId
		const isNew = view?.id === null && id !== null
		const record = isNew ? { ...next, id } : next
		return write(
			(store) => store.saveLimitGroup(record),
			"cards.error.saveGroup",
			() => {
				pendingId = null
				if (isNew) panel.created({ kind: "limit", id: record.id })
				else panel.back()
			},
		)
	}

	const remove = (next: LimitGroup) =>
		write(
			(store) => store.deleteLimitGroup(next.id),
			"cards.error.deleteGroup",
			() => panel.close({ ask: false }),
		)

	/** Whether what the panel asks for is read and can be drawn. */
	const ready = $derived(view !== null && data !== null && readFor === wanted && (wanted === null || group !== null))

	const form = $derived(view?.form ?? null)

	/** The head: the group's name over its holder and cards, or the form's over the group's. */
	const head = $derived.by((): { title: string; detail?: string; back: boolean } => {
		void lang
		if (!view) return { title: "", back: false }
		if (view.id === null) return { title: t("limits.page.new"), back: false }
		const name = group?.name ?? view.id
		if (form) return { title: t("limits.panel.edit"), detail: name, back: true }
		const count = cards.length
		const many = t(count === 1 ? "cards.page.count.one" : "cards.page.count.many", { count })
		return { title: name, detail: group ? `${ownerName(ownerOf(group), data?.owners)} · ${many}` : "", back: false }
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
		lead={group && !form ? lead : undefined}
		actions={group && !form ? actions : undefined}
		onback={head.back ? toGroup : undefined}
		backLabel={head.back && group ? tr("panel.backToRecord", { name: group.name }) : undefined}
		onclose={() => panel.close()}
		ontouch={() => panel.touch()}
		full={form !== null || current.id === null}>
		{#if !formFailed && !busy}
			<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{/if}
		{#if data}
			{#key `${current.id ?? ""}:${form?.name ?? ""}`}
				{#if current.id === null}
					<GroupForm
						group={null}
						groups={data.groups}
						owners={data.owners}
						inUse={false}
						error={formFailed ? error : ""}
						{busy}
						onsave={(next: LimitGroup) => void save(next)}
						ondelete={() => {}} />
				{:else if group && form?.name === "edit"}
					<GroupForm
						{group}
						groups={data.groups}
						owners={data.owners}
						inUse={cards.length > 0}
						error={formFailed ? error : ""}
						{busy}
						onsave={(next: LimitGroup) => void save(next)}
						ondelete={(next: LimitGroup) => void remove(next)}
						oncancel={toGroup} />
				{:else if group}
					{@render summary(data)}
				{/if}
			{/key}
		{/if}
	</DetailPanel>
{/if}

{#snippet lead()}
	{#if group}
		<span class="mini limit-chip" data-g={toGroupColor(group.color) ?? undefined} aria-hidden="true"></span>
	{/if}
{/snippet}

{#snippet actions()}
	<button
		type="button"
		data-variant="quiet"
		data-action="edit"
		aria-label={tr("limits.panel.edit")}
		onclick={() => panel.openForm({ name: "edit" })}>
		{tr("common.edit")}
	</button>
{/snippet}

{#snippet summary(money: MoneyData)}
	<div class="limit-detail">
		{#if figures}
			<section class="limit-hero" data-g={toGroupColor(group?.color) ?? undefined}>
				<small>{tr("limits.panel.room")}</small>
				<span class="limit-room" data-room data-numeric>{formatAmount(figures.room)}</span>
				<span class="usage" data-level={level} aria-hidden="true">
					<span style:inline-size="{Math.min(100, Math.max(0, figures.usedPct))}%"></span>
				</span>
				<small data-used
					>{tr("limits.panel.used", {
						used: formatAmount(figures.limit - figures.room),
						limit: formatAmount(figures.limit),
					})}</small
				>
				<small data-note>{note}</small>
			</section>
		{/if}
		<section class="limit-cards">
			<h3>{tr("cards.title")}</h3>
			{#if cards.length === 0}
				<p class="empty">{tr("limits.panel.empty")}</p>
			{:else}
				<div class="row-panel">
					{#each cards as entry (entry.id)}
						<button
							type="button"
							class="set-row"
							data-card={entry.id}
							onclick={() => panel.deeper({ kind: "card", id: entry.id })}>
							<span class="mini" data-g={groupColor(entry, money.groups) ?? undefined}>{entry.last4}</span>
							<span class="set-row__text">
								<span>{cardLine(entry.id, entry, { short: true })}</span>
								{#if entry.archived}
									<small class="set-row__sub">{tr("cards.archived")}</small>
								{/if}
							</span>
							<span class="limit-go" aria-hidden="true">›</span>
						</button>
					{/each}
				</div>
			{/if}
		</section>
	</div>
{/snippet}

<style>
	.limit-detail {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}

	/* The group's colour as a plain chip: a swatch, no digits. */
	.limit-chip {
		inline-size: calc(var(--cc-space-5) + var(--cc-space-1) / 2);
		border-radius: 50%;
	}

	.limit-chip[data-g] {
		background: var(--g-bg);
		border: var(--cc-border-width) solid color-mix(in oklab, var(--g-fg) 35%, transparent);
	}

	.limit-hero {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		padding: var(--cc-space-4);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.limit-hero[data-g] {
		background: var(--g-soft);
		border-color: color-mix(in oklab, var(--g-fg) 18%, transparent);
	}

	.limit-hero small {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.limit-room {
		font-size: var(--cc-text-2xl);
		font-weight: var(--cc-hero-amount-weight);
		line-height: var(--cc-hero-amount-leading);
		letter-spacing: var(--cc-hero-amount-tracking);
	}

	.limit-hero[data-g] .limit-room {
		color: var(--g-fg);
	}

	/* The usage bar, in the tiles' rail colours, as a group's panel on the list draws it. */
	.usage {
		display: block;
		inline-size: 100%;
		block-size: var(--cc-space-1);
		margin-block: var(--cc-space-1);
		overflow: hidden;
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.usage > span {
		display: block;
		block-size: 100%;
		background: var(--cc-text-muted);
		border-radius: var(--cc-radius-sm);
	}

	.usage[data-level="high"] > span {
		background: var(--cc-warning);
	}

	.usage[data-level="over"] > span {
		background: var(--cc-danger);
	}

	.limit-cards {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-2);
	}

	.limit-cards h3 {
		margin: 0;
		font-size: var(--cc-text-md);
		font-weight: 700;
	}

	/* Two classes, to outrank app.css's `.page .set-row`, which spreads the row's parts apart. */
	.limit-cards .set-row {
		justify-content: flex-start;
	}

	.limit-cards .set-row__text {
		flex: 1;
	}

	.limit-go {
		color: var(--cc-text-muted);
	}

	.empty {
		margin: 0;
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
		text-align: center;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	@media (forced-colors: active) {
		.usage {
			border: var(--cc-border-width) solid;
		}

		.usage > span {
			background: CanvasText;
		}
	}
</style>
