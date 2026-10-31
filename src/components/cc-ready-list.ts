import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import {
	READY_SORTS,
	type ReadyRow,
	type ReadySort,
	sortReady,
} from "#lib/domain/home";
import { usageLevel, usageShare } from "#lib/domain/limit";
import type { Location } from "#lib/domain/location";
import { formatAmount } from "#lib/domain/money";
import type { PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { locationText, relativeDayText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { icons } from "#lib/ui/icons";
import { base, usageBar } from "#styles/shared";

/** Cards that can take a purchase now, sortable, each a toggle for the purchase list. */
@customElement("cc-ready-list")
export class CcReadyList extends LitElement {
	static override styles = [
		base,
		usageBar,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			h2 {
				font-size: var(--cc-text-2xl);
				font-weight: 700;
			}

			h2 small {
				display: block;
				font-size: var(--cc-text-sm);
				font-weight: 400;
				color: var(--cc-text-muted);
			}

			/* A segmented control: one row, never wrapping. On a phone a row too long for the
			   screen scrolls sideways; from 900px the options share the full width equally. */
			.chips {
				display: flex;
				flex-direction: row;
				flex-wrap: nowrap;
				gap: var(--cc-space-1);
				padding: var(--cc-space-1);
				overflow-x: auto;
				background: var(--cc-surface-sunken);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				scrollbar-width: thin;
			}

			.chip {
				flex: 1 0 auto;
				padding: var(--cc-space-2) var(--cc-space-3);
				border: var(--cc-border-width) solid transparent;
				border-radius: var(--cc-radius-sm);
				background: transparent;
				color: var(--cc-text-muted);
				font: inherit;
				font-size: var(--cc-text-sm);
				white-space: nowrap;
				text-align: center;
				cursor: pointer;
			}

			.chip:hover {
				color: var(--cc-text);
			}

			.chip[aria-pressed="true"] {
				background: var(--cc-accent-surface);
				border-color: var(--cc-accent);
				color: var(--cc-link);
				font-weight: 600;
			}

			@media (min-width: 900px) {
				.chip {
					flex: 1 1 0;
				}
			}

			.picks {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: var(--cc-space-3);
			}

			@media (min-width: 640px) {
				.picks {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
			}

			@media (min-width: 1200px) {
				.picks {
					grid-template-columns: repeat(4, minmax(0, 1fr));
				}
			}

			.pick {
				display: grid;
				grid-template-columns: auto 1fr auto;
				gap: var(--cc-space-1) var(--cc-space-3);
				align-items: center;
				inline-size: 100%;
				padding: var(--cc-space-3);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				background: var(--cc-surface);
				color: var(--cc-text);
				font: inherit;
				text-align: start;
				cursor: pointer;
			}

			.pick[aria-pressed="true"] {
				background: var(--cc-accent-surface);
				border-color: var(--cc-accent);
			}

			.tick {
				display: grid;
				place-items: center;
				inline-size: var(--cc-space-5);
				block-size: var(--cc-space-5);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-xs);
				color: var(--cc-surface);
			}

			.pick[aria-pressed="true"] .tick {
				background: var(--cc-accent);
				border-color: var(--cc-accent);
			}

			.tick .icon {
				inline-size: var(--cc-icon-size-sm);
				block-size: var(--cc-icon-size-sm);
			}

			.name {
				display: flex;
				flex-direction: column;
				min-inline-size: 0;
			}

			.name small,
			.room small {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.room {
				display: flex;
				flex-direction: column;
				align-items: flex-end;
				font-variant-numeric: tabular-nums;
			}

			.meta {
				grid-column: 2 / -1;
				display: flex;
				flex-wrap: wrap;
				gap: 0 var(--cc-space-3);
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
				font-variant-numeric: tabular-nums;
			}

			.meta .overdue {
				color: var(--cc-danger);
				font-weight: 600;
			}

			.usage {
				grid-column: 2 / -1;
			}

			.note {
				padding: var(--cc-space-3) var(--cc-space-4);
				border-radius: var(--cc-radius-sm);
				background: var(--cc-surface-sunken);
			}
		`,
	];

	@property({ attribute: false }) rows: ReadyRow[] = [];
	@property({ attribute: false }) selected: string[] = [];
	@property({ attribute: false }) locations: Location[] = [];
	@property() today: PlainDate = "";
	/** How many unarchived cards point at no limit group. */
	@property({ type: Number }) unassigned = 0;
	@state() sort: ReadySort = "room";

	constructor() {
		super();
		new LocaleController(this);
	}

	private toggle(cardId: string) {
		this.dispatchEvent(
			new CustomEvent("toggle", {
				detail: { cardId },
				bubbles: true,
				composed: true,
			}),
		);
	}

	private pick(row: ReadyRow) {
		const locale = getLocale();
		const id = row.card.id;
		const selected = this.selected.includes(id);
		const share = usageShare(row.room.used, row.room.group.limit);
		return html`
			<button class="pick" data-card=${id} aria-pressed=${selected ? "true" : "false"}
				@click=${() => this.toggle(id)}>
				<span class="tick" aria-hidden="true">${selected ? icons.check : nothing}</span>
				<span class="name"><b>${id}</b><small>${row.card.name}</small></span>
				<span class="room">
					<b>${formatAmount(row.room.room)}</b>
					<small>${row.room.sharedWith > 0 ? t("ready.roomShared") : t("ready.room")}</small>
				</span>
				<span class="meta">
					<span>${t("ready.closes", {
						date: displayDate(row.closeDate, locale),
						relative: relativeDayText(this.today, row.closeDate),
					})}</span>
					<span>${t("ready.due", { date: displayDate(row.dueDate, locale) })}</span>
					${row.overdue ? html`<span class="overdue">${t("ready.overdue")}</span>` : nothing}
				</span>
				<div class="usage" data-level=${usageLevel(row.room.used, row.room.group.limit)}
					role="img" aria-label=${t("limits.usage", { share })}>
					<span style=${`inline-size: ${share}%`}></span>
				</div>
			</button>
		`;
	}

	private notice() {
		if (this.unassigned === 0) return nothing;
		return html`
			<p data-testid="unassigned">
				${t(
					this.unassigned === 1
						? "spendable.unassigned.one"
						: "spendable.unassigned.many",
					{ count: this.unassigned },
				)}
				<a href="/cards">${t("spendable.unassignedAction")}</a>
			</p>
		`;
	}

	override render() {
		const places = this.locations.map(locationText).join(", ");
		const count = this.rows.length;
		const header = html`
			<h2>
				${t("ready.title")}
				<small>${t(count === 1 ? "ready.summary.one" : "ready.summary.many", { count, places })}</small>
			</h2>
		`;
		if (this.rows.length === 0) {
			return html`
				${header}
				<div class="note">
					<p>${t("ready.empty")}</p>
					<p>${t("quickAdd.noEligible")}</p>
					<a data-action="settings" href="/settings">${t("ready.toSettings")}</a>
				</div>
				${this.notice()}
			`;
		}
		return html`
			${header}
			<div class="chips" row role="group" aria-label=${t("ready.sortBy")}>
				${READY_SORTS.map(
					(sort) => html`
						<button class="chip" data-sort=${sort}
							aria-pressed=${this.sort === sort ? "true" : "false"}
							@click=${() => {
								this.sort = sort;
							}}>${t(`ready.sort.${sort}` as const)}</button>
					`,
				)}
			</div>
			<div class="picks">
				${sortReady(this.rows, this.sort).map((row) => this.pick(row))}
			</div>
			${this.notice()}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-list": CcReadyList;
	}
}
