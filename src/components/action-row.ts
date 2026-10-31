import { css, html, nothing, type TemplateResult } from "lit";
import { daysBetween, displayDate } from "#lib/domain/date";
import type {
	Card,
	CardPayment,
	LimitGroup,
	PurchaseList,
} from "#lib/domain/types";
import { getLocale, t } from "#lib/i18n/index";
import { cardOwnerName } from "#lib/ui/card-label";
import { icons } from "#lib/ui/icons";

/*
 * One row shape for Home's *Needs you* and Transactions' *Upcoming* (DD-108): an icon that
 * says the kind, a bold title, a muted subtitle, and on
 * the right an optional amount with an optional action button under it. The text builders
 * below are pure (given the locale), so both lists word a thing the same way.
 */

export type ActionKind = "waiting" | "overdue" | "planned" | "draft";

export type ActionRowText = {
	kind: ActionKind;
	title: string;
	subtitle: string;
};

const ICONS: Record<ActionKind, TemplateResult> = {
	waiting: icons.clock,
	overdue: icons.alert,
	planned: icons.clock,
	draft: icons.transactions,
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

/**
 * A planned payment: the amount is on the right (DD-108); the date sits under the title, and
 * Upcoming adds the payment's note.
 */
export function plannedText(
	payment: CardPayment,
	card: Card | undefined,
	groups: LimitGroup[],
	today: string,
	upcoming: boolean,
): ActionRowText {
	return {
		kind: "planned",
		title: t("row.planned", {
			card: cardOwnerName(payment.cardId, card, groups),
			when: whenWords(payment.date, today),
		}),
		subtitle: [
			displayDate(payment.date, getLocale()),
			...(upcoming && payment.note ? [payment.note] : []),
		].join(" · "),
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

export type ActionRowOptions = {
	/** The row opens a page... */
	href?: string;
	/** ...or toggles something in place... */
	onToggle?: () => void;
	expanded?: boolean;
	/** The right-hand figure, already signed, and its tone. */
	amount?: { text: string; tone: "out" | "in" | "muted" | "danger" };
	/** The buttons under the figure. With neither `href` nor `onToggle` the row is plain text
	 * and these are its only controls (a planned payment, DD-110). */
	action?: TemplateResult | undefined;
	/** What opens under the row (a two-step confirm). */
	below?: TemplateResult | typeof nothing;
	/** Names the row for tests and the page: `data-row`. */
	id?: string;
};

/**
 * Draws a row. The left part (icon and text) is one link or button that opens the item; the
 * right part, when there is one, holds the figure and its own button beside it, never inside it.
 */
export function actionRow(
	text: ActionRowText,
	{
		href,
		onToggle,
		expanded,
		amount,
		action,
		below = nothing,
		id,
	}: ActionRowOptions,
): TemplateResult {
	const inside = html`<span class="a-ic" data-kind=${text.kind}>${ICONS[text.kind]}</span>
		<span class="a-text">
			<b class="a-title">${text.title}</b>
			<span class="a-sub">${text.subtitle}</span>
		</span>`;
	const hit = href
		? html`<a class="a-hit" data-item=${text.kind} href=${href}>${inside}</a>`
		: !onToggle
			? html`<div class="a-hit" data-item=${text.kind}>${inside}</div>`
			: html`<button type="button" class="a-hit" data-item=${text.kind}
				aria-expanded=${expanded ? "true" : "false"} @click=${() => onToggle?.()}>${inside}</button>`;
	const right =
		amount || action
			? html`<span class="a-right">${
					amount
						? html`<b class="amount ${amount.tone}" data-numeric>${amount.text}</b>`
						: nothing
				}${action ?? nothing}</span>`
			: nothing;
	return html`<div class="a-wrap" data-row=${id ?? nothing}>
		<div class="a-row">${hit}${right}</div>
		${below}
	</div>`;
}

/** The row's styles; the host also takes `rowPanel`. */
export const actionRowStyles = css`
	.a-wrap {
		display: flex;
		flex-direction: column;
	}

	.a-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--cc-space-3);
	}

	/* The quiet ground reaches the panel's inner edges (DD-105, DD-109); a
	   neutral icon tile, whose fill is that ground, turn to the surface so they still show. */
	.a-row:has(> :is(a, button).a-hit:hover) {
		background: var(--cc-surface-sunken);
		box-shadow:
			calc(var(--cc-space-4) * -1) 0 0 var(--cc-surface-sunken),
			var(--cc-space-4) 0 0 var(--cc-surface-sunken);
	}

	.a-row:has(> :is(a, button).a-hit:hover) .a-ic:not([data-kind="waiting"], [data-kind="overdue"]) {
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

	.a-row:not(:has(> .a-right)) {
		grid-template-columns: minmax(0, 1fr);
	}

	.a-hit:hover {
		text-decoration: none;
		background: transparent;
	}

	.a-hit:focus-visible {
		box-shadow: var(--cc-focus-ring);
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

	.a-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
		gap: var(--cc-space-1);
		padding-block: var(--cc-space-3);
		line-height: 1.25;
		text-align: end;
	}

	/* A lone button sits at the right edge, under the amount (shared.ts sets flex-start). */
	.a-right > button,
	.pay-right > button {
		align-self: flex-end;
	}

	/* Below 900px the row stacks (DD-109): the title takes the full width beside the icon and
	   may wrap, the subtitle sits under it, then a last line holds the figure on the
	   left and the button on the right, both in line with the text. */
	@media (max-width: 899.98px) {
		.a-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
		}

		.a-row:has(> .a-right) > .a-hit {
			padding-block-end: var(--cc-space-2);
		}

		.a-right {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			padding-block: 0 var(--cc-space-3);
			padding-inline-start: calc(var(--cc-space-5) + var(--cc-space-3) + var(--cc-space-3));
			text-align: start;
		}

		.a-right > button,
		.pay-right > button {
			align-self: center;
		}
	}

	.a-btns {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--cc-space-2);
	}

	.a-right button,
	.pay-right button {
		padding: var(--cc-space-1) var(--cc-space-3);
		font-size: var(--cc-text-xs);
		font-weight: 650;
	}
`;
