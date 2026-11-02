import { css, html, type TemplateResult } from "lit";
import { displayDate } from "#lib/domain/date";
import type { ReadyRow } from "#lib/domain/home";
import { usageLevel, usageShare } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import { cardOwnerOf, ownerOf } from "#lib/domain/owner";
import type { LimitGroup, PlainDate } from "#lib/domain/types";
import { relativeDayText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import {
	cardMini,
	cardName,
	cardPanel,
	cardPanelLabel,
} from "#lib/ui/card-label";

/**
 * Line 2's tags: who the card is for, then its status. A card that is not supplementary names
 * its account holder (`ownerOf` its group, as Cards does); a supplementary one names its
 * cardholder (`cardOwnerOf`, so one saved without a holder names the account holder),
 * `Account` and the account holder, and `Sub`. An overdue bill adds *Overdue bill*.
 */
function readyTags(row: ReadyRow): TemplateResult[] {
	const tag = (text: string) => html`<span class="tag">${text}</span>`;
	const account = ownerOf(row.room.group);
	const tags: TemplateResult[] = [];
	if (row.card.supplementary) {
		const holder = cardOwnerOf(row.card, row.room.group);
		if (holder) tags.push(tag(holder));
		tags.push(tag(t("ready.account", { owner: account })));
		tags.push(tag(t("ready.sub")));
	} else tags.push(tag(account));
	if (row.overdue)
		tags.push(
			html`<span class="tag" data-urgency="overdue">${t("ready.overdue")}</span>`,
		);
	return tags;
}

/** The panel form with `id) name` as a link to the card's page in a new tab. */
function linkedCard(row: ReadyRow, groups: LimitGroup[]): TemplateResult {
	const { id } = row.card;
	return html`<span class="card-panel">${cardMini(row.card, groups)} <a class="card-link"
		href=${`/card?id=${encodeURIComponent(id)}`} target="_blank" rel="noopener"
		aria-label=${t("ready.openCard", { card: cardName(id, row.card) })}
		@click=${stop} @keydown=${stop} @keyup=${stop}>${cardPanelLabel(id, row.card)}</a></span>`;
}

const stop = (event: Event) => event.stopPropagation();

/**
 * One *Ready to use* card as a panel row (DD-103), the parts after any leading tick, in three
 * lines: the card in the panel form with its room on the right; the owner and status tags
 * (every ready card has a group, so there is always an owner); the close and due dates, then
 * the usage bar. `cc-ready-picker` and `cc-ready-panel` draw their rows with it, inside a
 * `rowPanel` `.panel`. With `link` (the picker) the card's `id) name` is a link to its page in
 * a new tab; the caller stops the link's events from reaching the row's toggle.
 */
export function readyRowParts(
	row: ReadyRow,
	groups: LimitGroup[],
	today: PlainDate,
	link = false,
): TemplateResult {
	const locale = getLocale();
	const share = usageShare(row.room.used, row.room.group.limit);
	return html`
		<span class="what"><b>${link ? linkedCard(row, groups) : cardPanel(row.card.id, row.card, groups)}</b></span>
		<span class="r">
			<b class="amount" data-numeric>${formatAmount(row.room.room)}</b>
			<small>${row.room.sharedWith > 0 ? t("ready.roomShared") : t("ready.room")}</small>
		</span>
		<span class="sub tags">${readyTags(row)}</span>
		<span class="sub meta">
			<span>${t("ready.closes", {
				date: displayDate(row.closeDate, locale),
				relative: relativeDayText(today, row.closeDate),
			})}</span>
			<span>${t("ready.due", { date: displayDate(row.dueDate, locale) })}</span>
		</span>
		<span class="usage" data-level=${usageLevel(row.room.used, row.room.group.limit)}
			role="img" aria-label=${t("limits.usage", { share })}>
			<span style=${`inline-size: ${share}%`}></span>
		</span>
	`;
}

/**
 * The row's grid: `.lead` (a tick, on the picker only), the card, the room; the tags, the dates
 * and the bar run under the card and the room. A row with no tick sets `data-plain`.
 */
export const readyRowStyles = css`
	.ready-row {
		grid-template-columns: auto minmax(0, 1fr) auto;
		row-gap: var(--cc-space-1);
	}

	.ready-row[data-plain] {
		grid-template-columns: minmax(0, 1fr) auto;
		cursor: default;
	}

	.ready-row .tags,
	.ready-row .meta,
	.ready-row .usage {
		grid-column: 2 / -1;
	}

	.ready-row .tags {
		gap: var(--cc-space-1);
	}

	.ready-row[data-plain] .tags,
	.ready-row[data-plain] .meta,
	.ready-row[data-plain] .usage {
		grid-column: 1 / -1;
	}

	.ready-row .card-link {
		color: inherit;
		text-decoration: none;
	}

	.ready-row .card-link:hover {
		text-decoration: underline;
	}

	.ready-row .meta {
		font-variant-numeric: tabular-nums;
	}

	.ready-row .usage {
		margin-block-start: var(--cc-space-1);
	}
`;
