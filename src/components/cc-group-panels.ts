import type { GroupPanel } from "#lib/domain/cards-view"

import { css, html, LitElement, nothing } from "lit"
import { customElement, property } from "lit/decorators.js"

import { toGroupColor } from "#lib/domain/group-color"
import { formatAmount } from "#lib/domain/money"
import { ownerOf } from "#lib/domain/owner"
import { LocaleController } from "#lib/i18n/controller"
import { t } from "#lib/i18n/index"
import { icons } from "#lib/ui/icons"
import { base, controls, groupInk, usageBar } from "#styles/shared"

/**
 * The bar's tint, as a card tile's rail (`roomLevel`): over once the room is below zero,
 * getting full from 80%, else within.
 */
const level = (panel: GroupPanel) => (panel.room < 0 ? "over" : panel.full ? "high" : "within")

/**
 * The Cards page's *Limit groups* (prototype `vCards` aside): one heading row (`part="head"`,
 * which the page hides on a phone) with the count and *Add group* (`add-group`) at its end,
 * then a panel per group -- `name (holder)`, `room of limit`, the bar in the tiles' rail colours,
 * its cards' ids, `N% used` and *getting full* from 80%, or *over limit* -- each a button that emits
 * `open-group` with the group's id.
 */
@customElement("cc-group-panels")
export class CcGroupPanels extends LitElement {
	static override styles = [
		base,
		controls,
		usageBar,
		groupInk,
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
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-2) var(--cc-space-3);
			}

			.sec-title {
				display: flex;
				flex-direction: row;
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
				display: inline-flex;
				align-items: center;
				gap: var(--cc-space-1);
				align-self: center;
			}

			[data-action="add-group"] .icon {
				inline-size: var(--cc-icon-size-sm);
				block-size: var(--cc-icon-size-sm);
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

			/* A group with a colour wears its soft tint; hover deepens the edge, never an underline. */
			.gpanel[data-g] {
				background: var(--g-soft);
				border-color: color-mix(in oklab, var(--g-fg) 18%, transparent);
			}

			.gpanel[data-g]:hover {
				border-color: color-mix(in oklab, var(--g-fg) 55%, transparent);
			}

			.gpanel[data-g] .gname {
				color: var(--g-fg);
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
	]

	@property({ attribute: false }) panels: GroupPanel[] = []

	constructor() {
		super()
		new LocaleController(this)
	}

	private panel(panel: GroupPanel) {
		const { group } = panel
		const over = level(panel) === "over"
		const note = [
			panel.cardIds.join(", "),
			over ? t("cards.page.over") : t("cards.page.used", { pct: panel.usedPct }),
			panel.full && !over ? t("cards.group.full") : "",
		]
			.filter(Boolean)
			.join(" · ")
		const width = Math.min(100, Math.max(0, panel.usedPct))
		return html`<button type="button" class="gpanel" data-group=${group.id}
			data-g=${toGroupColor(group.color) ?? nothing}
			@click=${() => this.dispatchEvent(new CustomEvent("open-group", { detail: { id: group.id } }))}>
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
		</button>`
	}

	override render() {
		return html`
			<div class="sec-head" part="head">
				<span class="sec-title">
					<h2>${t("limits.title")}</h2>
					<small>${this.panels.length}</small>
				</span>
				<button type="button" data-variant="quiet" data-action="add-group"
					@click=${() => this.dispatchEvent(new CustomEvent("add-group"))}>${icons.plus}${t("cards.group.add")}</button>
			</div>
			${
				this.panels.length === 0
					? html`<p class="empty">${t("cards.group.empty")}</p>`
					: this.panels.map((p) => this.panel(p))
			}
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-group-panels": CcGroupPanels
	}
}
