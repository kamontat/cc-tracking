import {
	css,
	html,
	nothing,
	type ReactiveController,
	type ReactiveControllerHost,
	type TemplateResult,
} from "lit";
import {
	dayMonth,
	daysBetween,
	displayDate,
	today as plainToday,
} from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import type {
	Card,
	CardPayment,
	LimitGroup,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types";
import { getLocale, type MessageKey, t } from "#lib/i18n/index";
import { cardLine, cardOwnerName } from "#lib/ui/card-label";
import { icons } from "#lib/ui/icons";

/*
 * One row shape for Home's *Needs you* and Transactions' *Upcoming* (DD-108): an icon that
 * says the kind, a bold title, a muted subtitle, and on
 * the right an optional amount with an optional action button under it. The text builders
 * below are pure (given the locale), so both lists word a thing the same way.
 *
 * It is also the one row that opens in place (Needs you, the ledger, the Lists view): with
 * `open` the head is one button that shows or hides the row's drawer under it, and
 * `useOpenRow` keeps one row open per component. The drawer (DD-165) holds an optional
 * billing cycle line (`cycleLine`) or parts (`partLines`), then a foot: one sentence (`say`)
 * and the buttons.
 */

export type ActionKind =
	| "waiting"
	| "overdue"
	| "planned"
	| "draft"
	| "purchase"
	| "payment"
	| "saved";

export type ActionRowText = {
	kind: ActionKind;
	/** Words, or markup where a part of it reads differently (a ledger row's muted kind). */
	title: string | TemplateResult;
	subtitle: string | TemplateResult;
};

const ICONS: Record<ActionKind, TemplateResult> = {
	waiting: icons.clock,
	overdue: icons.alert,
	planned: icons.clock,
	draft: icons.transactions,
	purchase: icons.cards,
	payment: icons.wallet,
	saved: icons.bookmark,
};

/** A list's cards as `name (owner)` when three or fewer, else "N cards" (DD-110). */
export function cardsOrCount(
	ids: string[],
	cards: Card[],
	groups: LimitGroup[],
): string {
	const byId = new Map(cards.map((card) => [card.id, card]));
	return ids.length <= 3
		? ids.map((id) => cardOwnerName(id, byId.get(id), groups)).join(", ")
		: t("row.cards", { count: ids.length });
}

/** How far a plan's date is from today: today, tomorrow, in N days, or N days ago once past. */
export function whenWords(date: string, today: string): string {
	const days = daysBetween(today, date);
	if (days === 0) return t("row.when.today");
	if (days === 1) return t("row.when.tomorrow");
	if (days > 1) return t("row.when.in", { days });
	return agoWords(-days);
}

/** "1 day ago" / "N days ago". */
export const agoWords = (days: number): string =>
	days === 1 ? t("row.ago.one") : t("row.ago.many", { days });

/** "for 1 day" / "for N days": how long a bill has been overdue. */
export const forWords = (days: number): string =>
	days === 1 ? t("row.for.one") : t("row.for.many", { days });

const listDate = (list: PurchaseList) => displayDate(list.date, getLocale());

/** A waiting list; the total is the row's amount on the right (DD-108), not in the subtitle. */
export function waitingText(
	list: PurchaseList,
	cards: Card[],
	groups: LimitGroup[],
): ActionRowText {
	const named = cardsOrCount(
		list.lines.map((l) => l.cardId),
		cards,
		groups,
	);
	return {
		kind: "waiting",
		title: t("row.waiting", { date: listDate(list) }),
		subtitle: named,
	};
}

export function draftText(
	list: PurchaseList,
	cards: Card[],
	groups: LimitGroup[],
): ActionRowText {
	return {
		kind: "draft",
		title: t("row.draft", { date: listDate(list) }),
		subtitle: cardsOrCount(
			list.lines.map((l) => l.cardId),
			cards,
			groups,
		),
	};
}

/** A saved list; its total (the made lines) is the row's amount. */
export function savedText(
	list: PurchaseList,
	cards: Card[],
	groups: LimitGroup[],
): ActionRowText {
	return {
		kind: "saved",
		title: t("row.saved", { date: listDate(list) }),
		subtitle: cardsOrCount(
			list.lines.map((l) => l.cardId),
			cards,
			groups,
		),
	};
}

/**
 * A planned payment: the amount is on the right (DD-108); the date sits under the title. In
 * Needs you how far off it is follows the date; Upcoming keeps it in the title and adds the
 * payment's note.
 */
export function plannedText(
	payment: CardPayment,
	card: Card | undefined,
	groups: LimitGroup[],
	today: string,
	upcoming: boolean,
): ActionRowText {
	const name = cardOwnerName(payment.cardId, card, groups);
	const date = displayDate(payment.date, getLocale());
	const when = whenWords(payment.date, today);
	if (!upcoming)
		return {
			kind: "planned",
			title: t("row.plannedPay", { card: name }),
			subtitle: `${date} · ${when}`,
		};
	return {
		kind: "planned",
		title: t("row.planned", { card: name, when }),
		subtitle: [date, ...(payment.note ? [payment.note] : [])].join(" · "),
	};
}

/** A bill past its due date: `days` is how many days past it. */
export function overdueText(
	card: Card,
	groups: LimitGroup[],
	days: number,
): ActionRowText {
	return {
		kind: "overdue",
		title: t("row.overdue", {
			card: cardOwnerName(card.id, card, groups),
		}),
		subtitle: forWords(days),
	};
}

/** A money figure inside a sentence: strong, where the rest of the sentence is muted. */
export const money = (text: string): TemplateResult =>
	html`<span class="a-money" data-numeric>${text}</span>`;

/**
 * The catalog's sentence `key` with its placeholders filled by `params`, which may be markup
 * (a `money` figure, a red `a-late` phrase); words stay words, so the sentence reads the same in
 * either language.
 */
export function say(
	key: MessageKey,
	params: Record<string, string | number | TemplateResult> = {},
): TemplateResult {
	const pieces = t(key).split(/\{(\w+)\}/);
	return html`${pieces.map((piece, i) =>
		i % 2 === 0 ? piece : piece in params ? params[piece] : `{${piece}}`,
	)}`;
}

/** The day a list was sent, as day and month: its `sentAt` in Bangkok, else the list's date. */
export function sentWords(list: PurchaseList): string {
	const at = list.sentAt ? new Date(list.sentAt) : undefined;
	const day = at && !Number.isNaN(at.getTime()) ? plainToday(at) : list.date;
	return dayMonth(day, getLocale());
}

/** Label and amount lines above an opened row's foot: a list's lines, a payment's statements. */
export function partLines(
	parts: { label: string | TemplateResult; amount: string }[],
): TemplateResult {
	return html`<div class="a-parts">${parts.map(
		(part) =>
			html`<div class="a-part"><span>${part.label}</span><span data-numeric>${part.amount}</span></div>`,
	)}</div>`;
}

/**
 * An opened list row's parts: each line's card in the line form and its amount (the row's head
 * already carries the total). A saved list shows what was bought: the real amount, or "Not
 * made" (the reply page's words). Missing cards keep their id (`cardLine`).
 */
export function listParts(list: PurchaseList, cards: Card[]): TemplateResult {
	const byId = new Map(cards.map((card) => [card.id, card]));
	const saved = list.status === "saved";
	return partLines(
		list.lines.map((line) => ({
			label: cardLine(line.cardId, byId.get(line.cardId)),
			amount: !saved
				? formatAmount(line.amount)
				: line.made
					? formatAmount(line.actual ?? line.amount)
					: t("reply.notMade"),
		})),
	);
}

/** A marker on the billing cycle line: bought, the close (to come or past), due, or today. */
export type CycleMark = {
	kind: "buy" | "closes" | "closed" | "due" | "now";
	date: PlainDate;
};

const MARK_WORDS: Record<CycleMark["kind"], MessageKey> = {
	buy: "row.cycle.bought",
	closes: "row.cycle.closes",
	closed: "row.cycle.closed",
	due: "row.cycle.due",
	now: "row.cycle.spoken.today",
};

/** Within this share of an end, a marker's label aligns to that end, so it never clips. */
const EDGE = 6;

/**
 * A statement's billing cycle drawn to scale (DD-165): a track from `start` to `end`, filled
 * up to `fillTo` (red when `late`), and a marker for each of `marks` in date order. Every
 * position comes from one scale, `daysBetween(start, d) / daysBetween(start, end)`, clamped to
 * the line. *Today* is a tick with its label above the track; the rest are circles with the
 * label under. When `late`, the due marker is red too. The line is one image to a screen
 * reader: its `aria-label` says the dates in words, today last.
 */
export function cycleLine({
	start,
	end,
	marks,
	fillTo,
	late = false,
}: {
	start: PlainDate;
	end: PlainDate;
	marks: CycleMark[];
	fillTo: PlainDate;
	late?: boolean;
}): TemplateResult {
	const span = Math.max(1, daysBetween(start, end));
	const at = (date: PlainDate) =>
		Math.min(100, Math.max(0, (daysBetween(start, date) / span) * 100));
	const percent = (value: number) => `${Number(value.toFixed(2))}%`;
	const locale = getLocale();
	const ordered = marks
		.map((mark, i) => ({ mark, i }))
		.sort((a, b) => at(a.mark.date) - at(b.mark.date) || a.i - b.i)
		.map(({ mark }) => mark);
	const spoken = [
		...ordered.filter((m) => m.kind !== "now"),
		...ordered.filter((m) => m.kind === "now"),
	].map((mark, i) => {
		const words = t(MARK_WORDS[mark.kind], {
			date: dayMonth(mark.date, locale),
		});
		return i === 0
			? words
			: words.charAt(0).toLocaleLowerCase(locale) + words.slice(1);
	});
	return html`<div class="a-cycle" role="img" aria-label=${spoken.join(t("row.cycle.join"))}>
		<span class="a-track"></span>
		<span class="a-fill" ?data-late=${late} style=${`inline-size: ${percent(at(fillTo))}`}></span>
		${ordered.map((mark) => {
			const p = at(mark.date);
			const edge = p < EDGE ? "start" : p > 100 - EDGE ? "end" : undefined;
			const label =
				mark.kind === "now"
					? t("row.cycle.today")
					: t(MARK_WORDS[mark.kind], { date: dayMonth(mark.date, locale) });
			return html`<span class="a-mk" aria-hidden="true" data-mark=${mark.kind}
				data-edge=${edge ?? nothing} ?data-late=${late && mark.kind === "due"}
				style=${`inset-inline-start: ${percent(p)}`}><i></i>${label}</span>`;
		})}
	</div>`;
}

export type ActionRowOptions = {
	/** The row opens in place: the head toggles a drawer under it, `above` (a cycle line or
	 * parts) then a foot of the sentence `say` and the buttons (`action`). `detailsId` names
	 * that region (`useOpenRow`'s `detailsId`). */
	open: {
		expanded: boolean;
		onToggle: () => void;
		detailsId: string;
		/** The cycle line (`cycleLine`) or parts (`partLines`); none when left out. */
		above?: TemplateResult | typeof nothing;
		/** The one sentence; money figures through `money`, the rest muted. */
		say: string | TemplateResult | typeof nothing;
	};
	/** Drawn in place of the kind's icon (a ledger row's card chip). */
	lead?: TemplateResult | undefined;
	/** The right-hand figure, already signed, and its tone. */
	amount?: { text: string; tone: "out" | "in" | "muted" | "danger" };
	/** The buttons, at the end of the opened row's foot (DD-110). */
	action?: TemplateResult | undefined;
	/** Names the row for tests and the page: `data-row`. */
	id?: string;
};

/**
 * Draws a row. The whole head (icon, text, figure and a chevron) is one button, and nothing
 * interactive sits inside it: the buttons live in the drawer it controls.
 */
export function actionRow(
	text: ActionRowText,
	{ open, lead, amount, action, id }: ActionRowOptions,
): TemplateResult {
	const figure = amount
		? html`<b class="amount ${amount.tone}" data-numeric>${amount.text}</b>`
		: nothing;
	const inside = html`${
		lead ??
		html`<span class="a-ic" data-kind=${text.kind}>${ICONS[text.kind]}</span>`
	}
		<span class="a-text">
			<b class="a-title">${text.title}</b>
			<span class="a-sub">${text.subtitle}</span>
		</span>`;
	const headId = `${open.detailsId}-head`;
	return html`<div class="a-wrap" data-row=${id ?? nothing}>
		<div class="a-row">
			<button type="button" class="a-hit" id=${headId} data-item=${text.kind}
				aria-expanded=${open.expanded ? "true" : "false"}
				aria-controls=${open.detailsId}
				@click=${() => open.onToggle()}>${inside}${figure}<span class="a-chev">${icons.chevron}</span></button>
		</div>
		<div class="a-details" id=${open.detailsId} role="region"
			aria-labelledby=${headId} ?hidden=${!open.expanded}>
			${open.above ?? nothing}
			<div class="a-foot"><p class="a-say">${open.say}</p>${action ? html`<div class="a-btns">${action}</div>` : nothing}</div>
		</div>
	</div>`;
}

/**
 * Keeps at most one row open in a component (Needs you, the ledger, the Lists view):
 * opening a row closes the one before, a second tap on it closes it, and `prune` forgets a row
 * that is gone (a plan marked paid), so a repaint keeps the open row only while it exists.
 * Nothing of it goes in the address. `onChange` hears every change of the open row, so the
 * host can end a half-done two-step swap (`TwoStepController.reset`) when its row closes.
 *
 * A row id must be unique within the component across every kind of row it draws: a
 * payment's id repeats across cards (`PaymentRef` is `{ cardId, id }`), so callers namespace
 * them by kind and, where needed, card:
 *
 *     rows.toggle(`plan:${payment.id}`);
 *     rows.isOpen(`pay:${cardId}:${payment.id}`);
 *     rows.detailsId(`buy:${cardId}:${purchase.id}`);
 *     rows.prune(lists.map((list) => `list:${list.id}`));
 */
export class OpenRowController implements ReactiveController {
	private open: string | undefined;
	private readonly prefix: string;

	constructor(
		private readonly host: ReactiveControllerHost,
		private readonly onChange: () => void = () => {},
	) {
		host.addController(this);
		this.prefix = host instanceof Element ? host.localName : "row";
	}

	hostConnected(): void {}

	isOpen(id: string): boolean {
		return this.open === id;
	}

	toggle(id: string): void {
		this.open = this.open === id ? undefined : id;
		this.onChange();
		this.host.requestUpdate();
	}

	/** Forgets the open row when `ids` (the rows still drawn) no longer holds it; call it
	 * from the host's `willUpdate`, so the repaint it causes is the one under way. */
	prune(ids: string[]): void {
		if (this.open !== undefined && !ids.includes(this.open)) {
			this.open = undefined;
			this.onChange();
			this.host.requestUpdate();
		}
	}

	/** The id of a row's details region: `${host tag}-${id}`, each run of whitespace made
	 * `_` so it stays one id that `aria-controls` can name. */
	detailsId(id: string): string {
		return `${this.prefix}-${id.replace(/\s+/g, "_")}`;
	}
}

export function useOpenRow(
	host: ReactiveControllerHost,
	onChange?: () => void,
): OpenRowController {
	return new OpenRowController(host, onChange);
}

/** The row's styles; the host also takes `rowPanel`. */
export const actionRowStyles = css`
	/* --a-lead-inline is how far the text sits from the row's start: the kind icon and its
	   gap. A host whose lead is another width (the ledger's card chip) sets it to match. */
	.a-wrap {
		--a-lead-inline: calc(var(--cc-space-5) + var(--cc-space-3) + var(--cc-space-3));
		display: flex;
		flex-direction: column;
	}

	.a-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: center;
	}

	/* The quiet ground reaches the panel's inner edges (DD-105, DD-109); a
	   neutral icon tile, whose fill is that ground, turn to the surface so they still show. */
	.a-row:has(> button.a-hit:hover) {
		background: var(--cc-surface-sunken);
		box-shadow:
			calc(var(--cc-space-4) * -1) 0 0 var(--cc-surface-sunken),
			var(--cc-space-4) 0 0 var(--cc-surface-sunken);
	}

	.a-row:has(> button.a-hit:hover) .a-ic:not([data-kind="waiting"], [data-kind="overdue"]) {
		background: var(--cc-surface);
	}

	/* So does a neutral tag in the subtitle (a ledger row's *Archived*). */
	.a-row:has(> button.a-hit:hover) .tag:not([data-tone], [data-urgency="overdue"], [data-urgency="soon"], [data-urgency="credit"]) {
		background: var(--cc-surface);
	}

	.a-hit {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		align-self: stretch;
		gap: var(--cc-space-3);
		padding: var(--cc-space-3) 0;
		font: inherit;
		font-weight: 400;
		line-height: inherit;
		white-space: normal;
		text-align: start;
		text-decoration: none;
		color: var(--cc-text);
		cursor: pointer;
		background: transparent;
		border: 0;
		border-radius: 0;
	}

	.a-hit:hover {
		text-decoration: none;
		background: transparent;
	}

	button.a-hit:focus-visible {
		box-shadow: var(--cc-focus-ring);
	}

	/* An opening row's head: the lead, the text, the figure and the chevron on one line; the
	   text wraps rather than widen the row. */
	button.a-hit[aria-expanded] {
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		inline-size: 100%;
	}

	button.a-hit[aria-expanded]:not(:has(.amount)) {
		grid-template-columns: auto minmax(0, 1fr) auto;
	}

	button.a-hit[aria-expanded] .amount {
		white-space: nowrap;
		text-align: end;
	}

	.a-chev {
		display: grid;
		place-items: center;
		color: var(--cc-text-muted);
		transition: rotate var(--cc-row-motion) var(--cc-sheet-ease);
	}

	.a-chev .icon {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	[aria-expanded="true"] .a-chev {
		rotate: 0.5turn;
	}

	@media (prefers-reduced-motion: reduce) {
		.a-chev {
			transition: none;
		}
	}

	/* What opens under the head, a drawer lined up with the text past the icon (DD-165): the
	   billing cycle line or the parts, then the foot. */
	.a-details {
		display: grid;
		gap: var(--cc-space-3);
		padding-block: 0 var(--cc-space-3);
		padding-inline-start: var(--a-lead-inline);
		min-inline-size: 0;
	}

	.a-details[hidden] {
		display: none;
	}

	/* The foot: one sentence, then the buttons. Below 900px they stack, the buttons wrapping at
	   their own width from the start; from 900px they share a line, buttons at the end. */
	.a-foot {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	@media (min-width: 900px) {
		.a-foot {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.a-foot .a-btns {
			flex: none;
			margin-inline-start: auto;
		}
	}

	.a-say {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
		overflow-wrap: anywhere;
	}

	.a-say:empty {
		display: none;
	}

	.a-money {
		font-weight: 650;
		color: var(--cc-text);
	}

	.a-late {
		font-weight: 650;
		color: var(--cc-danger);
	}

	/* Parts: a label on the left, its amount on the right. */
	.a-parts {
		display: grid;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
	}

	.a-part {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	.a-part > :first-child {
		min-inline-size: 0;
		overflow-wrap: anywhere;
	}

	.a-part > [data-numeric] {
		flex: none;
	}

	/* The billing cycle line: a track on the axis, a fill from its start, and markers placed by
	   inline style along it. Circles hang on the axis with their label under; Today is a tick
	   with its label above, so it never meets a neighbour's label. */
	.a-cycle {
		position: relative;
		block-size: var(--cc-cycle-height);
		margin-inline: var(--cc-space-1);
	}

	.a-track,
	.a-fill {
		position: absolute;
		inset-block-start: calc(var(--cc-cycle-axis) - var(--cc-cycle-track) / 2);
		inset-inline-start: 0;
		block-size: var(--cc-cycle-track);
		border-radius: var(--cc-radius-pill);
	}

	.a-track {
		inset-inline-end: 0;
		background: var(--cc-surface-sunken);
	}

	.a-fill {
		background: var(--cc-text-muted);
		opacity: var(--cc-cycle-fill-opacity);
	}

	.a-fill[data-late] {
		background: var(--cc-danger);
		opacity: 1;
	}

	.a-mk {
		position: absolute;
		inset-block-start: calc(var(--cc-cycle-axis) - var(--cc-cycle-dot) / 2);
		translate: -50% 0;
		display: grid;
		justify-items: center;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-2xs);
		line-height: 1.5;
		color: var(--cc-text-muted);
		white-space: nowrap;
	}

	.a-mk i {
		box-sizing: border-box;
		inline-size: var(--cc-cycle-dot);
		block-size: var(--cc-cycle-dot);
		background: var(--cc-surface);
		border: var(--cc-ring-width) solid var(--cc-text-muted);
		border-radius: var(--cc-radius-pill);
	}

	.a-mk[data-mark="buy"] i {
		background: var(--cc-text);
		border-color: var(--cc-text);
	}

	.a-mk[data-late] {
		font-weight: 650;
		color: var(--cc-danger);
	}

	.a-mk[data-late] i {
		border-color: var(--cc-danger);
	}

	.a-mk[data-mark="now"] {
		inset-block-start: auto;
		inset-block-end: calc(
			var(--cc-cycle-height) - var(--cc-cycle-axis) - var(--cc-cycle-tick) / 2
		);
		display: flex;
		flex-direction: column-reverse;
		align-items: center;
		gap: calc(var(--cc-space-1) / 2);
		font-weight: 650;
		color: var(--cc-accent);
	}

	.a-mk[data-mark="now"] i {
		inline-size: var(--cc-rule-width);
		block-size: var(--cc-cycle-tick);
		background: var(--cc-accent);
		border: 0;
		border-radius: var(--cc-radius-pill);
	}

	.a-mk[data-edge="start"] {
		translate: 0 0;
		justify-items: start;
		align-items: flex-start;
	}

	.a-mk[data-edge="end"] {
		translate: -100% 0;
		justify-items: end;
		align-items: flex-end;
	}

	.a-ic {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: calc(var(--cc-space-5) + var(--cc-space-3));
		block-size: calc(var(--cc-space-5) + var(--cc-space-3));
		color: var(--cc-text-muted);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.a-ic .icon {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	.a-ic[data-kind="waiting"] {
		color: var(--cc-warning);
		background: var(--cc-warning-surface);
	}

	.a-ic[data-kind="overdue"] {
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
	}

	.a-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: calc(var(--cc-space-1) / 2);
		min-inline-size: 0;
		line-height: 1.35;
	}

	.a-title {
		font-weight: 650;
	}

	.a-sub {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cc-space-1) var(--cc-space-2);
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	/* A row with nothing under its title (a ledger purchase with no note) keeps no gap for it. */
	.a-sub:empty {
		display: none;
	}

	.a-btns {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: flex-start;
		gap: var(--cc-space-2);
	}

	/* A swap's pair of buttons (two-step.ts) adds no box: they stay the row's buttons. */
	.a-swap {
		display: contents;
	}

	/* An opened row's page actions are links drawn as the primary or quiet button. */
	a.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--cc-accent-text);
		text-decoration: none;
		background: var(--cc-accent);
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-sm);
	}

	a.btn:hover {
		text-decoration: none;
		background: var(--cc-accent-hover);
	}

	a.btn[data-variant="quiet"] {
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: var(--cc-border);
	}

	a.btn[data-variant="quiet"]:hover {
		background: var(--cc-border);
	}

`;
