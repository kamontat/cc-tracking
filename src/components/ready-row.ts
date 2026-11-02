import { css, html, nothing, type TemplateResult } from "lit";
import { displayDate } from "#lib/domain/date";
import type { ReadyRow } from "#lib/domain/home";
import { usageLevel, usageShare } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import type { LimitGroup, PlainDate } from "#lib/domain/types";
import { relativeDayText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { cardPanel } from "#lib/ui/card-label";

/**
 * One *Ready to use* card as a panel row (DD-103), the parts after any leading tick: the card
 * in the panel form, its room on the right, then a line with the close and due dates (and an
 * *Overdue bill* tag) and the usage bar, both under the card. `cc-ready-picker` and
 * `cc-ready-panel` draw their rows with it, inside a `rowPanel` `.panel`.
 */
export function readyRowParts(
	row: ReadyRow,
	groups: LimitGroup[],
	today: PlainDate,
): TemplateResult {
	const locale = getLocale();
	const share = usageShare(row.room.used, row.room.group.limit);
	return html`
		<span class="what"><b>${cardPanel(row.card.id, row.card, groups)}</b></span>
		<span class="r">
			<b class="amount" data-numeric>${formatAmount(row.room.room)}</b>
			<small>${row.room.sharedWith > 0 ? t("ready.roomShared") : t("ready.room")}</small>
		</span>
		<span class="sub meta">
			<span>${t("ready.closes", {
				date: displayDate(row.closeDate, locale),
				relative: relativeDayText(today, row.closeDate),
			})}</span>
			<span>${t("ready.due", { date: displayDate(row.dueDate, locale) })}</span>
			${
				row.overdue
					? html`<span class="tag" data-urgency="overdue">${t("ready.overdue")}</span>`
					: nothing
			}
		</span>
		<span class="usage" data-level=${usageLevel(row.room.used, row.room.group.limit)}
			role="img" aria-label=${t("limits.usage", { share })}>
			<span style=${`inline-size: ${share}%`}></span>
		</span>
	`;
}

/**
 * The row's grid: `.lead` (a tick, on the picker only), the card, the room; the dates and the
 * bar run under the card and the room. A row with no tick sets `data-plain`.
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

	.ready-row .meta,
	.ready-row .usage {
		grid-column: 2 / -1;
	}

	.ready-row[data-plain] .meta,
	.ready-row[data-plain] .usage {
		grid-column: 1 / -1;
	}

	.ready-row .meta {
		font-variant-numeric: tabular-nums;
	}

	.ready-row .usage {
		margin-block-start: var(--cc-space-1);
	}
`;
