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
 * each a toggle with a tick, in one panel. A tap emits `toggle` with the card. A row's name is
 * only the card and its room, so a screen reader is not read the whole row on every tab.
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

			.tick {
				display: grid;
				place-items: center;
				align-self: center;
				inline-size: var(--cc-space-5);
				block-size: var(--cc-space-5);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-xs);
				color: var(--cc-accent-text);
			}

			.crow[aria-pressed="true"] .tick {
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
			return html`<button type="button" class="crow ready-row" data-card=${id}
				aria-pressed=${on ? "true" : "false"}
				aria-label=${t("ready.pickName", { card: cardName(id, row.card), room: formatAmount(row.room.room) })}
				@click=${() => this.toggle(id)}>
				<span class="tick" aria-hidden="true">${on ? icons.check : nothing}</span>
				${readyRowParts(row, this.groups, this.today)}
			</button>`;
		})}</div>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-picker": CcReadyPicker;
	}
}
