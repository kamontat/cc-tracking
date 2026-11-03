import {
	css,
	html,
	nothing,
	type ReactiveController,
	type ReactiveControllerHost,
	type TemplateResult,
} from "lit";
import { daysBetween, displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { listTotal } from "#lib/domain/purchase-list";
import type {
	Card,
	CardPayment,
	LimitGroup,
	PurchaseList,
} from "#lib/domain/types";
import { getLocale, t } from "#lib/i18n/index";
import { cardLine, cardOwnerName } from "#lib/ui/card-label";
import { icons } from "#lib/ui/icons";

/*
 * One row shape for Home's *Needs you* and Transactions' *Upcoming* (DD-108): an icon that
 * says the kind, a bold title, a muted subtitle, and on
 * the right an optional amount with an optional action button under it. The text builders
 * below are pure (given the locale), so both lists word a thing the same way.
 *
 * It is also the one row that opens in place (Needs you, the ledger, the Lists view): with
 * `open` the head is one button that shows or hides the row's details and buttons under it,
 * and `useOpenRow` keeps one row open per component.
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

/**
 * An opened list row's details: each line's card in the line form and its amount, then the
 * total. Missing cards keep their id (`cardLine`).
 */
export function listLines(list: PurchaseList, cards: Card[]): TemplateResult {
	const byId = new Map(cards.map((card) => [card.id, card]));
	const saved = list.status === "saved";
	// A saved list shows what was bought: the real amount, or "Not made" (the reply page's words).
	const figure = (line: PurchaseList["lines"][number]) =>
		!saved
			? formatAmount(line.amount)
			: line.made
				? formatAmount(line.actual ?? line.amount)
				: t("reply.notMade");
	return html`${list.lines.map(
		(line) =>
			html`<span class="a-line"><span>${cardLine(line.cardId, byId.get(line.cardId))}</span><span data-numeric>${figure(line)}</span></span>`,
	)}<span class="a-total" data-numeric>${t("row.lines.total", {
		amount: formatAmount(listTotal(list)),
	})}</span>`;
}

export type ActionRowOptions = {
	/** The row opens in place: the head toggles `details` and the buttons (`action`) under it.
	 * `detailsId` names that region (`useOpenRow`'s `detailsId`). */
	open: {
		expanded: boolean;
		onToggle: () => void;
		detailsId: string;
		/** The muted detail lines; `nothing` for none. */
		details: TemplateResult | typeof nothing;
	};
	/** Drawn in place of the kind's icon (a ledger row's card chip). */
	lead?: TemplateResult | undefined;
	/** The right-hand figure, already signed, and its tone. */
	amount?: { text: string; tone: "out" | "in" | "muted" | "danger" };
	/** The buttons, in the opened details (DD-110). */
	action?: TemplateResult | undefined;
	/** Names the row for tests and the page: `data-row`. */
	id?: string;
};

/**
 * Draws a row. The whole head (icon, text, figure and a chevron) is one button, and nothing
 * interactive sits inside it: the buttons live in the details region it controls.
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
			${open.details === nothing ? nothing : html`<div class="a-info">${open.details}</div>`}
			${action ? html`<div class="a-btns">${action}</div>` : nothing}
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

	/* What opens under the head: muted detail lines, then the buttons. It lines up with the
	   text, past the icon. */
	.a-details {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-2);
		padding-block: 0 var(--cc-space-3);
		padding-inline-start: var(--a-lead-inline);
		min-inline-size: 0;
	}

	.a-details[hidden] {
		display: none;
	}

	/* From 900px the detail lines and the buttons share one line: lines on the left, buttons
	   at the end, so an opened row grows by as little as it can. */
	@media (min-width: 900px) {
		.a-details {
			flex-direction: row;
			align-items: flex-end;
		}

		.a-info {
			flex: 1;
		}

		.a-details .a-btns {
			margin-inline-start: auto;
		}
	}

	.a-info {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		min-inline-size: 0;
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
		overflow-wrap: anywhere;
	}

	/* Details with no lines (a payment that reached no statement) leave no gap. */
	.a-info:empty {
		display: none;
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

	@media (max-width: 899.98px) {
		/* An opened row's buttons stack, each the full width, from the text's edge. */
		.a-details .a-btns {
			flex-direction: column;
			align-items: stretch;
		}

		.a-details .a-btns > *,
		.a-details .a-swap > * {
			inline-size: 100%;
		}
	}

	.a-btns {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: flex-end;
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

	/* A list's line in the opened details: the card on the left, its amount on the right. */
	.a-line {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		gap: var(--cc-space-3);
	}

	.a-total {
		align-self: flex-end;
		font-weight: 650;
		color: var(--cc-text);
	}
`;
