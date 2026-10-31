import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type ReadyRow, sortReady } from "#lib/domain/home";
import type { Location } from "#lib/domain/location";
import type { LimitGroup, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, cardBits, controls, rowPanel, usageBar } from "#styles/shared";
import { readyRowParts, readyRowStyles } from "./ready-row";

/** How many cards Home shows before *See more*. */
export const READY_TOP = 3;

/**
 * Home's short *Ready to use* (DD-103): the count, the three cards with the most room as panel
 * rows with no tick, then *See more (N)* (the control *Needs you* uses), which opens the rest in
 * place and reads *Show less* to fold them. Starting a list is the *+ New* menu's job and
 * `/list/new`'s. With no card ready it says so and leads to Settings.
 */
@customElement("cc-ready-panel")
export class CcReadyPanel extends LitElement {
	static override styles = [
		base,
		cardBits,
		controls,
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

			.more {
				align-self: center;
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

	/** Whether the cards past the first `READY_TOP` are open. */
	@state() private expanded = false;

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
		const sorted = sortReady(this.rows, "room");
		const top = this.expanded ? sorted : sorted.slice(0, READY_TOP);
		return html`${head}
			<div class="panel" id="ready-list">${top.map(
				(
					row,
				) => html`<div class="crow ready-row" data-plain data-card=${row.card.id}>
					${readyRowParts(row, this.groups, this.today)}
				</div>`,
			)}</div>
			${
				count > READY_TOP
					? html`<button type="button" class="more" data-variant="quiet" data-action="more"
							aria-controls="ready-list" aria-expanded=${this.expanded ? "true" : "false"}
							@click=${() => {
								this.expanded = !this.expanded;
							}}>${
								this.expanded
									? t("home.needs.less")
									: t("home.needs.more", { count: count - READY_TOP })
							}</button>`
					: nothing
			}
			${this.notice()}`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-panel": CcReadyPanel;
	}
}
