import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { GroupPanel } from "#lib/domain/cards-view";
import { formatAmount } from "#lib/domain/money";
import { ownerOf } from "#lib/domain/owner";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { icons } from "#lib/ui/icons";
import { base, controls, usageBar } from "#styles/shared";

/** The bar's tint: over the limit, getting full from 80%, else within. */
const level = (panel: GroupPanel) =>
	panel.usedPct > 100 ? "over" : panel.full ? "high" : "within";

/**
 * The Cards page's *Limit groups* (prototype `vCards` aside): the heading with the count and
 * *Add group* (`add-group`), then a panel per group -- `name (holder)`, `room of limit`, the
 * bar, its cards' ids, `N% used` and *getting full* from 80% -- each a button that emits
 * `open-group` with the group's id.
 */
@customElement("cc-group-panels")
export class CcGroupPanels extends LitElement {
	static override styles = [
		base,
		controls,
		usageBar,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
				min-inline-size: 0;
			}

			.sec-head {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: baseline;
				gap: var(--cc-space-2);
			}

			h2 {
				font-size: var(--cc-text-lg);
				font-weight: 700;
			}

			.sec-head small {
				font-size: var(--cc-text-xs);
			}

			[data-action="add-group"] {
				align-self: flex-start;
			}

			.gpanel {
				display: flex;
				flex-direction: column;
				align-items: stretch;
				gap: var(--cc-space-2);
				inline-size: 100%;
				padding: var(--cc-space-3) var(--cc-space-4);
				font: inherit;
				font-weight: 400;
				line-height: 1.35;
				white-space: normal;
				text-align: start;
				color: var(--cc-text);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}

			.gpanel:hover {
				background: var(--cc-surface-sunken);
			}

			.ghead {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: baseline;
				justify-content: space-between;
				gap: var(--cc-space-2);
			}

			.gname {
				font-weight: 650;
			}

			.ghead [data-numeric] {
				font-size: var(--cc-text-sm);
				white-space: nowrap;
			}

			.gnote {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.empty {
				padding: var(--cc-space-4);
				color: var(--cc-text-muted);
				text-align: center;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}
		`,
	];

	@property({ attribute: false }) panels: GroupPanel[] = [];

	constructor() {
		super();
		new LocaleController(this);
	}

	private panel(panel: GroupPanel) {
		const { group } = panel;
		const note = [
			panel.cardIds.join(", "),
			t("cards.page.used", { pct: panel.usedPct }),
			panel.full ? t("cards.group.full") : "",
		]
			.filter(Boolean)
			.join(" · ");
		const width = Math.min(100, Math.max(0, panel.usedPct));
		return html`<button type="button" class="gpanel" data-group=${group.id}
			@click=${() =>
				this.dispatchEvent(
					new CustomEvent("open-group", { detail: { id: group.id } }),
				)}>
			<span class="ghead">
				<span class="gname">${group.name} (${ownerOf(group)})</span>
				<span data-numeric>${t("cards.group.roomOf", {
					room: formatAmount(panel.room),
					limit: formatAmount(panel.limit),
				})}</span>
			</span>
			<span class="usage" data-level=${level(panel)} aria-hidden="true">
				<span style=${`inline-size: ${width}%`}></span>
			</span>
			<span class="gnote">${note}</span>
		</button>`;
	}

	override render() {
		return html`
			<div class="sec-head">
				<h2>${t("limits.title")}</h2>
				<small>${this.panels.length}</small>
			</div>
			<button type="button" data-variant="quiet" data-action="add-group"
				@click=${() => this.dispatchEvent(new CustomEvent("add-group"))}>${icons.plus}${t("cards.group.add")}</button>
			${
				this.panels.length === 0
					? html`<p class="empty">${t("cards.group.empty")}</p>`
					: this.panels.map((p) => this.panel(p))
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-group-panels": CcGroupPanels;
	}
}
