import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { type ReadyRow, sortReady } from "#lib/domain/home";
import type { Location } from "#lib/domain/location";
import type { LimitGroup, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, cardBits, rowPanel, usageBar } from "#styles/shared";
import { readyRowParts, readyRowStyles } from "./ready-row";

/** How many cards Home shows before *See all*. */
export const READY_TOP = 3;

/**
 * Home's short *Ready to use* (DD-103): the count, the three cards with the most room as panel
 * rows with no tick, then *Start a list* and *See all N ›*, both to the new-list picker
 * (`/list/new`). With no card ready it says so and leads to Settings.
 */
@customElement("cc-ready-panel")
export class CcReadyPanel extends LitElement {
	static override styles = [
		base,
		cardBits,
		usageBar,
		rowPanel,
		readyRowStyles,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.head {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: baseline;
				justify-content: space-between;
				gap: var(--cc-space-1) var(--cc-space-3);
			}

			h2 {
				font-size: var(--cc-text-2xl);
				font-weight: 700;
			}

			.head small {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.actions {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-2) var(--cc-space-4);
			}

			/* The primary button's look on a link (UI-02: no new variant). */
			a[data-action="start"] {
				display: inline-flex;
				flex-direction: row;
				align-items: center;
				justify-content: center;
				min-block-size: var(--cc-bar-height);
				padding: 0 var(--cc-space-5);
				font-weight: 650;
				color: var(--cc-accent-text);
				text-decoration: none;
				background: var(--cc-accent);
				border-radius: var(--cc-radius-sm);
			}

			a[data-action="start"]:hover {
				background: var(--cc-accent-hover);
			}

			a[data-action="see-all"] {
				font-weight: 650;
				color: var(--cc-link);
			}

			.note {
				padding: var(--cc-space-3) var(--cc-space-4);
				border-radius: var(--cc-radius-sm);
				background: var(--cc-surface-sunken);
			}
		`,
	];

	@property({ attribute: false }) rows: ReadyRow[] = [];
	@property({ attribute: false }) locations: Location[] = [];
	/** The stored limit groups, in order: a card's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	@property() today: PlainDate = "";
	/** How many unarchived cards that could take a purchase point at no limit group. */
	@property({ type: Number }) unassigned = 0;

	constructor() {
		super();
		new LocaleController(this);
	}

	private notice() {
		if (this.unassigned === 0) return nothing;
		return html`<p class="sub" data-testid="unassigned">
			${t(
				this.unassigned === 1
					? "spendable.unassigned.one"
					: "spendable.unassigned.many",
				{ count: this.unassigned },
			)}
			<a href="/cards">${t("spendable.unassignedAction")}</a>
		</p>`;
	}

	override render() {
		const count = this.rows.length;
		const places = this.locations.map(locationText).join(", ");
		const head = html`<div class="head">
			<h2>${t("ready.title")}</h2>
			<small>${t(count === 1 ? "ready.summary.one" : "ready.summary.many", { count, places })}</small>
		</div>`;
		if (count === 0) {
			return html`${head}
				<div class="note">
					<p>${t("ready.empty")}</p>
					<p>${t("quickAdd.noEligible")}</p>
					<a data-action="settings" href="/settings">${t("ready.toSettings")}</a>
				</div>
				${this.notice()}`;
		}
		const top = sortReady(this.rows, "room").slice(0, READY_TOP);
		return html`${head}
			<div class="panel">${top.map(
				(
					row,
				) => html`<div class="crow ready-row" data-plain data-card=${row.card.id}>
					${readyRowParts(row, this.groups, this.today)}
				</div>`,
			)}</div>
			<div class="actions">
				<a data-action="start" href="/list/new">${t("ready.start")}</a>
				<a data-action="see-all" href="/list/new">${t("ready.seeAll", { count })} ›</a>
			</div>
			${this.notice()}`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-panel": CcReadyPanel;
	}
}
