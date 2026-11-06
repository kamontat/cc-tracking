import type { LimitGroup, PlainDate } from "#lib/domain/types"

import { css, html, LitElement, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js"

import { LocaleController } from "#legacy/lib/i18n/controller"
import { base, controls } from "#legacy/styles/shared"
import { displayDate } from "#lib/domain/date"
import { type ReadyRow, sortReady } from "#lib/domain/home"
import { getLocale, t } from "#lib/i18n/index"
import { cardTileStyles, lastFour, tileBody, tileTone } from "./card-tile"

/** How many cards Home shows before *See more*. */
export const READY_TOP = 4

/**
 * Home's short *Ready to use* (DD-103): the count, the four cards with the most room as card
 * tiles that open the card's page (DD-151), then *See more (N)* (the control *Needs you* uses), which opens the rest in
 * place and reads *Show less* to fold them. Starting a list is the *+ New* menu's job and
 * `/list/new`'s. With no card ready it says so and leads to Settings.
 */
@customElement("cc-ready-panel")
export class CcReadyPanel extends LitElement {
	static override styles = [
		base,
		controls,
		cardTileStyles,
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
	]

	@property({ attribute: false }) rows: ReadyRow[] = []
	/** The shown names of the places that take purchases, already in order. */
	@property({ attribute: false }) places: string[] = []
	/** The stored limit groups, in order: a card's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = []
	/** Kept for the page's clock; the tiles' dates come with the rows. */
	@property() today: PlainDate = ""
	/** How many unarchived cards that could take a purchase point at no limit group. */
	@property({ type: Number }) unassigned = 0

	/** Whether the cards past the first `READY_TOP` are open. */
	@state() private expanded = false

	constructor() {
		super()
		new LocaleController(this)
	}

	private notice() {
		if (this.unassigned === 0) return nothing
		return html`<p class="sub" data-testid="unassigned">
			${t(this.unassigned === 1 ? "spendable.unassigned.one" : "spendable.unassigned.many", { count: this.unassigned })}
			<a href="/cards?ungrouped=1">${t("spendable.unassignedAction")}</a>
		</p>`
	}

	/**
	 * Three lines like every tile: `id) name` and the last 4; the room, with no word under it
	 * when it is plain room (credit and `N% used` still show; over the limit the amount turns red
	 * and has no word); then when the card closes, or, between a bill's close and its due date,
	 * when that bill is due.
	 */
	private tile(row: ReadyRow) {
		const locale = getLocale()
		const facts = row.billDue
			? t("tile.due", { date: displayDate(row.billDue, locale) })
			: t("tile.closes", { date: displayDate(row.closeDate, locale) })
		return html`<a class="tile" data-g=${tileTone(row.card, this.groups)} data-card=${row.card.id}
			href=${`/card?id=${encodeURIComponent(row.card.id)}`}>${tileBody({
				card: row.card,
				room: row.room,
				credit: row.credit,
				corner: lastFour(row.card),
				mono: true,
				facts,
				plainRoom: true,
				quietOver: true,
			})}</a>`
	}

	override render() {
		const count = this.rows.length
		const places = this.places.join(", ")
		const head = html`<div class="head">
			<h2>${t("ready.title")}</h2>
			<small>${t(count === 1 ? "ready.summary.one" : "ready.summary.many", { count, places })}</small>
		</div>`
		if (count === 0) {
			return html`${head}
				<div class="note">
					<p>${t("ready.empty")}</p>
					<p>${t("quickAdd.noEligible")}</p>
					<a data-action="settings" href="/settings/locations">${t("ready.toSettings")}</a>
				</div>
				${this.notice()}`
		}
		const sorted = sortReady(this.rows, "room")
		const top = this.expanded ? sorted : sorted.slice(0, READY_TOP)
		return html`${head}
			<div class="tiles" id="ready-list">${top.map((row) => this.tile(row))}</div>
			${
				count > READY_TOP
					? html`<button type="button" class="more" data-variant="quiet" data-action="more"
							aria-controls="ready-list" aria-expanded=${this.expanded ? "true" : "false"}
							@click=${() => {
								this.expanded = !this.expanded
							}}>${this.expanded ? t("common.showLess") : t("common.seeMore", { count: count - READY_TOP })}</button>`
					: nothing
			}
			${this.notice()}`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-panel": CcReadyPanel
	}
}
