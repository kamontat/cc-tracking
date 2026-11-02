import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ReadyRow } from "#lib/domain/home";
import { formatAmount } from "#lib/domain/money";
import type { LimitGroup, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { cardName } from "#lib/ui/card-label";
import { icons } from "#lib/ui/icons";
import { base, cardBits, rowPanel, usageBar } from "#styles/shared";
import { readyRowParts, readyRowStyles } from "./ready-row";

/**
 * The new-list picker's rows (DD-103): the ready cards as given (already filtered and sorted),
 * in one panel. A row is a plain container (DD-150): its tick is the toggle, a `<button
 * aria-pressed>` named only by the card and its room, so a screen reader is not read the whole
 * row on every tab, and the card's link is the tick's sibling, never inside it. A tap anywhere
 * on the row but the link emits `toggle` with the card, once; the link stops its own click.
 */
@customElement("cc-ready-picker")
export class CcReadyPicker extends LitElement {
	static override styles = [
		base,
		cardBits,
		usageBar,
		rowPanel,
		readyRowStyles,
		css`
			:host {
				display: block;
			}

			/* The focused tick rings the whole row, as the row button did. */
			.ready-row:has(> .tick:focus-visible) {
				box-shadow: var(--cc-focus-ring);
			}

			.tick:focus-visible {
				box-shadow: none;
			}

			.tick {
				display: grid;
				padding: 0;
				font: inherit;
				cursor: pointer;
				background: transparent;
				place-items: center;
				align-self: center;
				inline-size: var(--cc-space-5);
				block-size: var(--cc-space-5);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-xs);
				color: var(--cc-accent-text);
			}

			.tick[aria-pressed="true"] {
				background: var(--cc-accent);
				border-color: var(--cc-accent);
			}

			.tick .icon {
				inline-size: var(--cc-icon-size-sm);
				block-size: var(--cc-icon-size-sm);
			}
		`,
	];

	@property({ attribute: false }) rows: ReadyRow[] = [];
	@property({ attribute: false }) selected: string[] = [];
	/** The stored limit groups, in order: a card's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	@property() today: PlainDate = "";

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

	override render() {
		return html`<div class="panel">${this.rows.map((row) => {
			const id = row.card.id;
			const on = this.selected.includes(id);
			return html`<div class="crow ready-row" data-toggle data-card=${id} ?data-on=${on}
				@click=${() => this.toggle(id)}>
				<button type="button" class="tick" aria-pressed=${on ? "true" : "false"}
					aria-label=${t("ready.pickName", { card: cardName(id, row.card), room: formatAmount(row.room.room) })}>${
						on ? icons.check : nothing
					}</button>
				${readyRowParts(row, this.groups, this.today, true)}
			</div>`;
		})}</div>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-picker": CcReadyPicker;
	}
}
