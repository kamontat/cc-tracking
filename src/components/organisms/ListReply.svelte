<script lang="ts">
	import type { Snippet } from "svelte"
	import type { Card, LimitGroup, ListLine, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount, tick, untrack } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import Sheet from "#components/molecules/Sheet.svelte"
	import { addDays, headerDate } from "#lib/domain/date"
	import { lineAmount, withNote } from "#lib/domain/list-entry"
	import { formatAmount, formatAmountInput } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, cardName, groupColor } from "#lib/ui/card-label"

	/**
	 * The spender's reply to a sent list, drawn as the builder is (DD-195): a row per card in one
	 * row panel, each saying what was answered and what was made, opening its card's sheet. The
	 * sheet is headed by the card and steps ‹ › to the card before or after; each of the card's
	 * orders is a Made / Not made toggle, then what was planned beside the real amount (the box to
	 * type in once made, with *Use planned* when it is off the plan), and a note. Saving waits until every line is
	 * answered and every real amount is money; a not-made line can move to tomorrow's draft. The
	 * sheet is the page's to keep in history: every change asks `onsheet`. `side` takes the page's
	 * own actions, after Save (Cancel list).
	 */
	interface Props {
		/** The sent list being answered: its lines are the starting answers. */
		list: PurchaseList
		cards: Card[]
		/** The stored limit groups, in order: a card's chip takes its group's colour. */
		groups: LimitGroup[]
		/** The card whose sheet is open, or null. */
		sheet: string | null
		/** Asks the page to open, move or close the sheet. */
		onsheet: (cardId: string | null) => void
		/** The page's own actions, in the side panel after Save. */
		side?: Snippet
		onsavereply: (detail: { lines: ListLine[]; moveUnmade: boolean }) => void
	}

	const { list, cards, groups, sheet, onsheet, side, onsavereply }: Props = $props()

	/** One line's answer: unanswered, made or not, the real amount and the note as typed. */
	type Answer = { made: boolean | undefined; text: string; note: string }

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const startAnswers = (from: PurchaseList): Answer[] =>
		from.lines.map((line) => ({
			made: line.made,
			text: formatAmountInput(line.actual ?? line.amount),
			note: line.note ?? "",
		}))

	// The answers live here, not in the buttons or inputs, so a re-render keeps them. A fresh
	// copy of the same list (the page reloads after every change) keeps what was typed; only a
	// different list starts afresh.
	let answers = $state<Answer[]>(untrack(() => startAnswers(list)))
	let moveUnmade = $state(true)
	let seenId = untrack(() => list.id)
	$effect.pre(() => {
		const next = list
		if (next.id === seenId) return
		seenId = next.id
		untrack(() => {
			answers = startAnswers(next)
			moveUnmade = true
		})
	})

	let sheetRef = $state<ReturnType<typeof Sheet> | undefined>()
	let stepRoot = $state<HTMLElement | undefined>()

	const setAnswer = (index: number, change: Partial<Answer>) => {
		answers = answers.map((answer, i) => (i === index ? { ...answer, ...change } : answer))
	}

	/** The real amount in satang; null when it is blank or not money. */
	const real = (index: number): number | null => {
		const amount = lineAmount(answers[index]?.text ?? "")
		return amount === null || amount === 0 ? null : amount
	}

	const byId = $derived(new Map(cards.map((card) => [card.id, card])))
	const answered = $derived(answers.filter((a) => a.made !== undefined).length)
	const allAnswered = $derived(answered === list.lines.length)
	const madeIndexes = $derived(list.lines.flatMap((_, i) => (answers[i]?.made === true ? [i] : [])))
	const allMoney = $derived(madeIndexes.every((i) => real(i) !== null))
	const total = $derived(madeIndexes.reduce((sum, i) => sum + (real(i) ?? 0), 0))
	const unmade = $derived(list.lines.filter((_, i) => answers[i]?.made === false))

	/** The list's cards in the order they first appear, each with the indexes of its lines (its orders). */
	const groupsOfLines = $derived.by(() => {
		const out = new Map<string, number[]>()
		list.lines.forEach((line, i) => {
			out.set(line.cardId, [...(out.get(line.cardId) ?? []), i])
		})
		return [...out].map(([cardId, indexes]) => ({ cardId, indexes }))
	})

	/** A card's row: what its orders were planned at, made for, how many are answered, and its words. */
	const viewOf = (cardId: string, indexes: number[]) => {
		void lang
		const planned = indexes.reduce((sum, i) => sum + (list.lines[i]?.amount ?? 0), 0)
		const done = indexes.filter((i) => answers[i]?.made !== undefined).length
		const made = indexes.filter((i) => answers[i]?.made === true)
		const bad = made.some((i) => real(i) === null)
		const madeTotal = made.reduce((sum, i) => sum + (real(i) ?? 0), 0)
		const diff = bad ? 0 : made.reduce((sum, i) => sum + (real(i) ?? 0) - (list.lines[i]?.amount ?? 0), 0)
		const parts: string[] = []
		if (indexes.length > 1) parts.push(tr("purchaseList.row.orders", { count: indexes.length }))
		if (done === 0) parts.push(tr("reply.row.unanswered"))
		else if (done < indexes.length) parts.push(tr("reply.row.partial", { answered: done, count: indexes.length }))
		else if (made.length === indexes.length) parts.push(tr("reply.made"))
		else if (made.length === 0) parts.push(tr("reply.notMade"))
		else parts.push(tr("reply.row.mixed", { made: made.length, notMade: indexes.length - made.length }))
		if (bad) parts.push(tr("purchaseList.row.bad"))
		else if (diff !== 0) parts.push(diffText(diff))
		const noted = indexes.map((i) => answers[i]?.note.trim() ?? "").filter(Boolean)
		if (noted.length > 0) parts.push(noted.join(", "))
		const pending = done < indexes.length
		const unmade = !pending && made.length === 0
		return {
			cardId,
			indexes,
			card: byId.get(cardId),
			pending,
			unmade,
			bad,
			// What was made once every order is answered; until then, or when nothing was, the plan.
			sum: pending || unmade ? planned : madeTotal,
			detail: parts.join(" · "),
		}
	}

	const views = $derived(groupsOfLines.map((g) => viewOf(g.cardId, g.indexes)))
	const at = $derived(sheet === null ? -1 : views.findIndex((v) => v.cardId === sheet))
	const sheetView = $derived(at === -1 ? null : views[at])

	const summary = $derived.by(() => {
		if (!allAnswered) return tr("reply.answerAll", { answered, count: list.lines.length })
		return tr("reply.summary", { made: madeIndexes.length, notMade: list.lines.length - madeIndexes.length })
	})

	const label = $derived.by(() => {
		if (!allAnswered || madeIndexes.length === 0) return tr("reply.save.none")
		if (madeIndexes.length === 1) return tr("reply.save.one")
		return tr("reply.save.many", { count: madeIndexes.length })
	})

	const moveText = $derived.by(() => {
		void lang
		return tr("reply.move", {
			cards: [...new Set(unmade.map((line) => line.cardId))].map((id) => cardName(id, byId.get(id))).join(", "),
			date: headerDate(addDays(list.date, 1), getLocale(), false),
		})
	})

	function diffText(diff: number) {
		return tr("reply.diff", { diff: `${diff > 0 ? "+" : ""}${formatAmount(diff)}` })
	}

	/** A card's `id) name`, re-read when the language changes (a missing card's dash is translated). */
	const panelLabel = (id: string) => {
		void lang
		return cardLine(id, byId.get(id), { short: true })
	}

	/**
	 * Listens on the box itself, as the Lit template did, rather than through Svelte's delegated
	 * root listener, so an `input` that does not bubble still records what was typed.
	 */
	const typed = (index: number, field: "text" | "note") => (input: HTMLInputElement) => {
		const handle = () => {
			setAnswer(index, { [field]: input.value })
		}
		input.addEventListener("input", handle)
		return () => input.removeEventListener("input", handle)
	}

	/** Made: the real amount's box shows, and takes the focus, as the builder's first amount does. */
	const answerMade = async (index: number) => {
		setAnswer(index, { made: true })
		await tick()
		const order = list.lines.slice(0, index).filter((l) => l.cardId === list.lines[index]?.cardId).length
		stepRoot?.querySelector<HTMLInputElement>(`[data-order="${order}"] [data-field="actual"]`)?.focus()
	}

	/** Plays the sheet's exit, then closes it; at once with no sheet. */
	const closeSheet = () => {
		if (sheetRef) sheetRef.leave(() => onsheet(null))
		else onsheet(null)
	}

	/** Enter in a sheet's box closes it, as *Done* does. */
	const onEnter = (event: KeyboardEvent) => {
		if (event.key !== "Enter" || event.isComposing) return
		event.preventDefault()
		closeSheet()
	}

	const save = () => {
		const lines = list.lines.map((line, i): ListLine => {
			const made = answers[i]?.made === true
			const amount = real(i)
			const reply: ListLine =
				made && amount !== null && amount !== line.amount
					? { cardId: line.cardId, amount: line.amount, made, actual: amount }
					: { cardId: line.cardId, amount: line.amount, made }
			return withNote(reply, answers[i]?.note)
		})
		onsavereply({ lines, moveUnmade })
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet chip(cardId: string, card: Card | undefined)}
	<span class="mini" data-g={groupColor(card, groups) ?? undefined} aria-hidden={card ? undefined : "true"}
		>{card?.last4 ?? ""}</span
	>
{/snippet}

{#snippet cardStep(view: ReturnType<typeof viewOf>)}
	{@const many = view.indexes.length > 1}
	<div class="card-step" data-card={view.cardId} bind:this={stepRoot}>
		{#if views.length > 1}
			<div class="nav" row>
				<span class="position">{tr("reply.position", { n: at + 1, count: views.length })}</span>
				<span class="steps" row>
					<button
						type="button"
						data-variant="quiet"
						data-action="prev-card"
						aria-label={tr("purchaseList.prevCard")}
						disabled={at <= 0}
						onclick={() => {
							const prev = views[at - 1]
							if (prev) onsheet(prev.cardId)
						}}>
						<SvgIcon name="back" />
					</button>
					<button
						type="button"
						data-variant="quiet"
						data-action="next-card"
						aria-label={tr("purchaseList.nextCard")}
						disabled={at >= views.length - 1}
						onclick={() => {
							const next = views[at + 1]
							if (next) onsheet(next.cardId)
						}}>
						<SvgIcon name="back" />
					</button>
				</span>
			</div>
		{/if}
		{#each view.indexes as index, order (index)}
			{@const line = list.lines[index]}
			{@const planned = line?.amount ?? 0}
			{@const answer = answers[index] ?? { made: undefined, text: "", note: "" }}
			{@const amount = real(index)}
			{@const diff = amount === null ? 0 : amount - planned}
			<div class="order" data-order={order}>
				{#if many}
					<div class="order-head">{tr("purchaseList.order", { n: order + 1 })}</div>
				{/if}
				<fieldset class="pair toggle" aria-label={tr("reply.wasMade")}>
					<button
						type="button"
						data-variant="quiet"
						data-answer="made"
						aria-pressed={answer.made === true ? "true" : "false"}
						onclick={() => answerMade(index)}>
						<SvgIcon name="check" />{tr("reply.made")}
					</button>
					<button
						type="button"
						data-variant="quiet"
						data-answer="not-made"
						aria-pressed={answer.made === false ? "true" : "false"}
						onclick={() => setAnswer(index, { made: false })}>
						<SvgIcon name="close" />{tr("reply.notMade")}
					</button>
				</fieldset>
				<div class="figures">
					<div data-figure="planned">
						<small>{tr("reply.figure.planned")}</small>
						<b>{formatAmount(planned)}</b>
					</div>
					{#if answer.made === true}
						<label data-figure="real">
							<small>{tr("reply.actual")}</small>
							<span class="amount-box amount-in" data-bad={amount === null ? "" : undefined}>
								<span aria-hidden="true">฿</span>
								<input
									inputmode="decimal"
									enterkeyhint="done"
									data-field="actual"
									value={answer.text}
									{@attach typed(index, "text")}
									onkeydown={onEnter}>
							</span>
						</label>
					{:else}
						<div data-figure="real" data-answer={answer.made === false ? "not-made" : undefined}>
							<small>{tr("reply.actual")}</small>
							<b>{answer.made === false ? tr("reply.notMade") : "—"}</b>
						</div>
					{/if}
				</div>
				{#if answer.made === true && amount === null}
					<p class="error">{tr("quickAdd.error.badAmount")}</p>
				{:else if answer.made === true && diff !== 0}
					<div class="off-plan" row>
						<p class="diff">{diffText(diff)}</p>
						<button
							type="button"
							data-variant="quiet"
							data-action="use-planned"
							onclick={() => setAnswer(index, { text: formatAmountInput(planned) })}>
							{tr("reply.usePlanned", { amount: formatAmount(planned) })}
						</button>
					</div>
				{/if}
				<label class="line-note">
					{tr("purchaseList.noteLabel")}
					<input
						data-field="note"
						enterkeyhint="done"
						placeholder={tr("purchaseList.notePlaceholder")}
						aria-label={tr("purchaseList.noteFor", { card: cardName(view.cardId, view.card) })}
						value={answer.note}
						{@attach typed(index, "note")}
						onkeydown={onEnter}>
				</label>
			</div>
		{/each}
		<div class="step-actions" row>
			<button type="button" data-action="done" onclick={closeSheet}>{tr("purchaseList.done")}</button>
		</div>
	</div>
{/snippet}

<div class="list-layout list-reply">
	<div class="list-layout__main">
		<p class="note">{tr("reply.hint")}</p>
		<div class="row-panel lines">
			{#each views as view (view.cardId)}
				<button
					type="button"
					class="line"
					data-card={view.cardId}
					data-warn={view.bad ? "" : undefined}
					data-action="open-card"
					onclick={() => onsheet(view.cardId)}>
					{@render chip(view.cardId, view.card)}
					<span class="what">
						<b class="card-label">{panelLabel(view.cardId)}</b>
						<small data-tone={view.bad ? "warn" : undefined}>{view.detail}</small>
					</span>
					<b class="sum" data-pending={view.pending ? "" : undefined} data-unmade={view.unmade ? "" : undefined}>
						{formatAmount(view.sum)}
					</b>
					<SvgIcon name="chevron" />
				</button>
			{/each}
		</div>
	</div>
	<div class="list-layout__side">
		{#if unmade.length > 0}
			<label class="move">
				<input
					type="checkbox"
					data-field="move"
					checked={moveUnmade}
					onchange={(e) => {
						moveUnmade = e.currentTarget.checked
					}}>
				{moveText}
			</label>
		{/if}
		<div class="action-bar" row>
			<span class="summary" class:warned={!allAnswered}>{summary}</span>
			<b class="total">{formatAmount(total)}</b>
			<button type="button" data-action="save-reply" disabled={!allAnswered || !allMoney} onclick={save}>
				{label}
			</button>
		</div>
		{@render side?.()}
	</div>
</div>

{#if sheetView}
	<Sheet bind:this={sheetRef} heading={panelLabel(sheetView.cardId)} onclose={() => onsheet(null)}>
		{#snippet lead()}
			<span class="mini" data-g={groupColor(sheetView.card, groups) ?? undefined} aria-hidden="true"
				>{sheetView.card?.last4 ?? ""}</span
			>
		{/snippet}
		{@render cardStep(sheetView)}
	</Sheet>
{/if}

<style>
	/* The layout, the side panel and the bar are app.css's `.list-layout` and `.action-bar`; the
	   card chip is its `.card-panel` and `.mini`, and the rows sit in its `.row-panel`, as on the
	   builder (`ListAmounts`). What follows is what the reply adds on top. */

	/* On a phone the step keeps listLayout's tighter gap; app.css's wider one is the review's and
	   the saved list's. From 900px both share app.css's grid gap. */
	@media (max-width: 899px) {
		.list-layout {
			gap: var(--cc-space-4);
		}
	}

	.list-reply p {
		margin: 0;
	}

	.list-layout__main > .note {
		padding: var(--cc-space-3) var(--cc-space-4);
		font-size: var(--cc-text-sm);
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	/* The list: one row panel, a row per card that opens its sheet. */
	.lines {
		display: flex;
		flex-direction: column;
		overflow: clip;
	}

	.lines > button.line {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		align-self: stretch;
		gap: var(--cc-space-3);
		padding: var(--cc-space-3) 0;
		font-size: var(--cc-text-md);
		font-weight: 400;
		line-height: var(--cc-leading);
		white-space: normal;
		text-align: start;
		color: var(--cc-text);
		cursor: pointer;
		background: transparent;
		border: 0;
		border-radius: 0;
	}

	/* After the reset above, so the line between rows holds. */
	.lines > button.line + button.line {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	/* Hover is a quiet ground carried across the panel's side padding (DD-105, DD-109). */
	.lines > button.line:hover {
		background: var(--cc-surface-sunken);
		box-shadow:
			calc(var(--cc-space-4) * -1) 0 0 var(--cc-surface-sunken),
			var(--cc-space-4) 0 0 var(--cc-surface-sunken);
	}

	.lines > button.line:focus-visible {
		box-shadow: var(--cc-focus-ring-inset);
	}

	/* A row with a real amount that is not money: an amber bar at its start, beside the words (UI-07). */
	.lines > button.line[data-warn] {
		box-shadow: inset var(--cc-rule-width) 0 0 var(--cc-warning);
		padding-inline-start: var(--cc-space-2);
	}

	.what {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-inline-size: 0;
		line-height: 1.35;
	}

	.what b {
		font-weight: 650;
	}

	.what small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.what small[data-tone="warn"] {
		font-weight: 600;
		color: var(--cc-warning);
	}

	.sum {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* Not every order answered: the planned sum, muted. */
	.sum[data-pending] {
		font-weight: 400;
		color: var(--cc-text-muted);
	}

	/* Nothing made: the planned sum, struck through. */
	.sum[data-unmade] {
		font-weight: 400;
		color: var(--cc-text-muted);
		text-decoration: line-through;
	}

	/* The row's chevron points the way it opens: to the side, into the sheet. */
	.line :global(.icon) {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
		color: var(--cc-text-muted);
		transform: rotate(-90deg);
	}

	/* One card in the sheet: where it is on the list, its orders, and Done at the foot. One track
	   that shrinks to the sheet, so a long unspaced Thai run never widens it past a phone's edge. */
	.card-step {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-3);
	}

	.nav {
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-3);
	}

	.position {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.steps {
		flex: none;
		gap: var(--cc-space-1);
	}

	.steps button {
		display: inline-grid;
		place-items: center;
		padding: var(--cc-space-1);
		line-height: 0;
	}

	.steps button:disabled {
		cursor: default;
		opacity: 0.4;
	}

	.steps :global(.icon),
	.toggle :global(.icon) {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	/* After the icon sizes above: the one arrow turned to point forward. */
	.steps button[data-action="next-card"] :global(.icon) {
		transform: scaleX(-1);
	}

	/* An order: the answer, the figures, the note, a line before the next. */
	.order {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-2);
	}

	.order + .order {
		padding-block-start: var(--cc-space-3);
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	.order-head {
		font-size: var(--cc-text-sm);
		font-weight: 600;
		color: var(--cc-text-muted);
	}

	/* Made / Not made: one segmented toggle on a sunken track, the picked half raised and tinted,
	   so it never reads as the sheet's primary button. */
	.toggle {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--cc-space-1);
		min-inline-size: 0;
		padding: var(--cc-space-1);
		margin: 0;
		background: var(--cc-surface-sunken);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.toggle button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--cc-space-2);
		padding-block: var(--cc-space-1);
		color: var(--cc-text-muted);
		background: transparent;
		border-color: transparent;
	}

	.toggle button:hover {
		color: var(--cc-text);
		background: var(--cc-surface);
	}

	.toggle button[data-answer="made"][aria-pressed="true"] {
		color: var(--cc-accent);
		background: var(--cc-accent-surface);
		border-color: var(--cc-accent);
	}

	.toggle button[data-answer="not-made"][aria-pressed="true"] {
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
		border-color: var(--cc-danger);
	}

	/* Planned beside the real amount: a caption over a box each, the real one app.css's amount
	   field once made, the planned one a box of the same size, so the two figures line up. */
	.figures {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--cc-space-2);
	}

	.figures > * {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		min-inline-size: 0;
	}

	.figures small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.figures b {
		display: flex;
		align-items: center;
		block-size: calc(var(--cc-amount-height) + 2 * var(--cc-border-width));
		padding: 0 var(--cc-space-3);
		font-size: var(--cc-text-xl);
		line-height: 1;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--cc-text-muted);
		background: var(--cc-surface-sunken);
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-sm);
	}

	.figures [data-answer="not-made"] b {
		color: var(--cc-danger);
	}

	.off-plan {
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-2);
	}

	.off-plan button {
		padding: var(--cc-space-1) var(--cc-space-2);
		font-size: var(--cc-text-xs);
	}

	.diff {
		font-size: var(--cc-text-sm);
		font-weight: 600;
		color: var(--cc-warning);
	}

	.error {
		font-size: var(--cc-text-sm);
		color: var(--cc-danger);
	}

	.line-note {
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.line-note input {
		min-inline-size: 0;
		padding-block: var(--cc-space-1);
		font-size: var(--cc-text-md);
		color: var(--cc-text);
	}

	.step-actions {
		gap: var(--cc-space-2);
		padding-block-start: var(--cc-space-1);
	}

	.step-actions button {
		flex: 1 1 0;
		justify-content: center;
		padding-block: var(--cc-space-2);
	}

	/* The move checkbox sits beside its words, not above them. */
	.move {
		flex-direction: row;
		align-items: center;
		gap: var(--cc-space-2);
		font-size: var(--cc-text-sm);
		color: var(--cc-text);
	}

	.move input {
		inline-size: auto;
	}

	.action-bar button {
		align-self: center;
		white-space: nowrap;
	}

	.action-bar button:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.summary {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.summary.warned {
		font-weight: 600;
		color: var(--cc-warning);
	}

	.total {
		font-size: var(--cc-text-lg);
		font-variant-numeric: tabular-nums;
	}

	@media (min-width: 900px) {
		/* In the side panel the bar is a plain column, Save filling its width. */
		.list-layout__side .action-bar {
			position: static;
			flex-direction: column;
			align-items: stretch;
			gap: var(--cc-space-3);
			padding: 0;
			background: none;
			border: 0;
			box-shadow: none;
		}

		.list-layout__side .action-bar button {
			align-self: stretch;
			text-align: center;
		}
	}
</style>
