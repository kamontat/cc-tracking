<script lang="ts">
	import type { Snippet } from "svelte"
	import type { Card, LimitGroup, ListLine, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount, untrack } from "svelte"

	import { addDays, headerDate } from "#lib/domain/date"
	import { lineAmount, withNote } from "#lib/domain/list-entry"
	import { formatAmount, formatAmountInput } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, cardName, groupColor } from "#lib/ui/card-label"

	/**
	 * The spender's reply to a sent list: Made or Not made per line, with the real amount of a
	 * made one and a note. Saving waits until every line is answered and every real amount is
	 * money; a not-made line can move to tomorrow's draft. `side` takes the page's own actions,
	 * after Save (Cancel list).
	 */
	interface Props {
		/** The sent list being answered: its lines are the starting answers. */
		list: PurchaseList
		cards: Card[]
		/** The stored limit groups, in order: a card's chip takes its group's colour. */
		groups: LimitGroup[]
		/** The page's own actions, in the side panel after Save. */
		side?: Snippet
		onsavereply: (detail: { lines: ListLine[]; moveUnmade: boolean }) => void
	}

	const { list, cards, groups, side, onsavereply }: Props = $props()

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

	const label = $derived.by(() => {
		if (!allAnswered) return tr("reply.answerAll", { answered, count: list.lines.length })
		if (madeIndexes.length === 1) return tr("reply.save.one", { total: formatAmount(total) })
		return tr("reply.save.many", { count: madeIndexes.length, total: formatAmount(total) })
	})

	const moveText = $derived.by(() => {
		void lang
		return tr("reply.move", {
			cards: unmade.map((line) => cardName(line.cardId, byId.get(line.cardId))).join(", "),
			date: headerDate(addDays(list.date, 1), getLocale(), false),
		})
	})

	const diffText = (diff: number) => tr("reply.diff", { diff: `${diff > 0 ? "+" : ""}${formatAmount(diff)}` })

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

<div class="list-layout list-reply">
	<div class="list-layout__main">
		<p class="note">{tr("reply.hint")}</p>
		<div class="lines">
			{#each list.lines as line, index (index)}
				{@const answer = answers[index] ?? { made: undefined, text: "", note: "" }}
				{@const amount = real(index)}
				{@const diff = amount === null ? 0 : amount - line.amount}
				{@const card = byId.get(line.cardId)}
				{@const color = groupColor(card, groups)}
				<section class="line" data-card={line.cardId}>
					<div class="top" row>
						<b
							><span class="card-panel"
								><span class="mini" data-g={color ?? undefined} aria-hidden={card ? undefined : "true"}
									>{card?.last4 ?? ""}</span
								>
								<span class="card-label">{panelLabel(line.cardId)}</span></span
							></b
						>
						<span class="planned">{tr("reply.planned", { amount: formatAmount(line.amount) })}</span>
					</div>
					<fieldset class="pair" aria-label={tr("reply.wasMade")}>
						<button
							type="button"
							data-answer="made"
							aria-pressed={answer.made === true ? "true" : "false"}
							data-variant={answer.made === true ? undefined : "quiet"}
							onclick={() => setAnswer(index, { made: true })}>
							{tr("reply.made")}
						</button>
						<button
							type="button"
							data-answer="not-made"
							aria-pressed={answer.made === false ? "true" : "false"}
							data-variant={answer.made === false ? "danger" : "quiet"}
							onclick={() => setAnswer(index, { made: false })}>
							{tr("reply.notMade")}
						</button>
					</fieldset>
					{#if answer.made === true}
						<label>
							{tr("reply.actual")}
							<input inputmode="decimal" data-field="actual" value={answer.text} {@attach typed(index, "text")}>
						</label>
						{#if amount === null}
							<p class="error">{tr("quickAdd.error.badAmount")}</p>
						{:else if diff !== 0}
							<p class="diff">{diffText(diff)}</p>
						{/if}
					{/if}
					<label class="line-note">
						{tr("purchaseList.noteLabel")}
						<input
							data-field="note"
							placeholder={tr("purchaseList.notePlaceholder")}
							aria-label={tr("purchaseList.noteFor", { card: cardName(line.cardId, card) })}
							value={answer.note}
							{@attach typed(index, "note")}>
					</label>
				</section>
			{/each}
		</div>
	</div>
	<div class="list-layout__side">
		<div class="action-bar">
			{#if unmade.length > 0}
				<label>
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
			<button type="button" data-action="save-reply" disabled={!allAnswered || !allMoney} onclick={save}>
				{label}
			</button>
		</div>
		{@render side?.()}
	</div>
</div>

<style>
	/* The layout, `.mini`, `.card-panel` and `.card-label` are app.css's; the action bar too,
	   restyled below as the reply's roomier column. */

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

	.list-reply .note {
		padding: var(--cc-space-3) var(--cc-space-4);
		font-size: var(--cc-text-sm);
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.lines {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		gap: var(--cc-space-4);
	}

	/* Two line cards side by side once the main column is wide enough for both. */
	@media (min-width: 1200px) {
		.lines {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	/* One card per line: the card list's panel. */
	/* One track that shrinks to the card, so a long unspaced Thai run never widens it past a phone's
	   edge. */
	.line {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-3);
		padding: var(--cc-space-4);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--cc-space-2);
	}

	.top b {
		flex: 1;
		min-inline-size: 0;
	}

	.planned {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
		font-variant-numeric: tabular-nums;
	}

	/* A choice group without a fieldset's frame. */
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--cc-space-2);
		min-inline-size: 0;
		padding: 0;
		margin: 0;
		border: 0;
	}

	/* Buttons, outranking app.css's `.page button` rules. */
	.list-reply button {
		align-self: flex-start;
		padding: var(--cc-space-2) var(--cc-space-3);
		font: inherit;
		font-size: var(--cc-text-sm);
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--cc-accent-text);
		cursor: pointer;
		background: var(--cc-accent);
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-sm);
	}

	.list-reply button:hover {
		background: var(--cc-accent-hover);
	}

	.list-reply button[data-variant="quiet"] {
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: var(--cc-border);
	}

	.list-reply button[data-variant="quiet"]:hover {
		background: var(--cc-border);
	}

	.list-reply button[data-variant="danger"] {
		color: var(--cc-danger);
		background: transparent;
		border-color: var(--cc-danger);
	}

	.list-reply button[data-variant="danger"]:hover {
		background: var(--cc-danger-surface);
	}

	.list-reply button:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.list-reply .pair button {
		align-self: stretch;
		text-align: center;
	}

	.list-reply .pair button[data-variant="danger"][aria-pressed="true"] {
		color: var(--cc-accent-text);
		background: var(--cc-danger);
	}

	.list-reply label {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	/* A checkbox sits beside its text, not above it. */
	.list-reply label:has(input[type="checkbox"]) {
		flex-direction: row;
		align-items: center;
		gap: var(--cc-space-2);
		color: var(--cc-text);
	}

	.list-reply input {
		width: 100%;
		padding: var(--cc-space-2);
		font: inherit;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	.list-reply input[type="checkbox"] {
		width: auto;
	}

	.list-reply input[data-field="actual"] {
		font-variant-numeric: tabular-nums;
	}

	.diff {
		color: var(--cc-warning);
		font-weight: 600;
	}

	.error {
		font-size: var(--cc-text-sm);
		color: var(--cc-danger);
	}

	.list-reply .line-note {
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.list-reply .line-note input {
		min-inline-size: 0;
		color: var(--cc-text);
	}

	/* The reply bar stacks its one button under the note, so it keeps a roomier padding. */
	.action-bar {
		display: grid;
		padding-block: var(--cc-space-3);
		align-items: normal;
		justify-content: normal;
	}

	.list-reply .action-bar button {
		align-self: stretch;
	}

	/* In the side panel the bar is a plain column, its button the panel's width. */
	@media (min-width: 900px) {
		.list-layout__side .action-bar {
			position: static;
			display: flex;
			flex-direction: column;
			align-items: stretch;
			gap: var(--cc-space-3);
			padding: 0;
			background: none;
			border: 0;
			box-shadow: none;
		}

		.list-reply .list-layout__side .action-bar button {
			text-align: center;
		}
	}
</style>
