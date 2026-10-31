import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import { ledgerUrgency } from "#lib/domain/ledger";
import { usageLevel, usageShare } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import type { GroupRoom } from "#lib/domain/room";
import type { LedgerStatement, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { openPayment } from "#lib/ui/pay-sheet";
import { base, controls, usageBar } from "#styles/shared";

/**
 * The three answers someone opens a card's page for, above its history: how much room is
 * left to spend, what this card owes, and what falls due next. Every figure arrives computed;
 * this only lays them out.
 */
@customElement("cc-card-summary")
export class CcCardSummary extends LitElement {
	static override styles = [
		base,
		controls,
		usageBar,
		css`
			:host {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--cc-tile-min)), 1fr));
				gap: var(--cc-space-3);
			}

			section {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
				padding: var(--cc-space-3) var(--cc-space-4);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				box-shadow: var(--cc-shadow-sm);
			}

			h2 {
				font-size: var(--cc-text-xs);
				font-weight: 600;
				color: var(--cc-text-muted);
				text-transform: uppercase;
				letter-spacing: 0.04em;
			}

			.figure {
				font-size: var(--cc-text-2xl);
				font-weight: 650;
				line-height: 1.2;
				font-variant-numeric: tabular-nums;
				letter-spacing: -0.01em;
			}

			.usage {
				margin-block: var(--cc-space-1);
			}

			/* The figure carries the tone, as well as the bar or edge, so it is never colour on a
			   sliver alone; the text beside it says the same thing in words. */
			section[data-level="high"] .figure {
				color: var(--cc-warning);
			}

			section[data-level="over"] .figure {
				color: var(--cc-danger);
			}

			section[data-urgency="soon"] {
				border-left: var(--cc-space-1) solid var(--cc-urgency-soon);
			}

			section[data-urgency="overdue"] {
				background: var(--cc-danger-surface);
				border-color: var(--cc-urgency-overdue);
				border-left: var(--cc-space-2) solid var(--cc-urgency-overdue);
			}

			section[data-urgency="overdue"] .figure {
				color: var(--cc-danger);
			}
		`,
	];

	/** The card's group room, from `roomFor`; null when it draws on no group. */
	@property({ attribute: false }) room: GroupRoom | null = null;
	/** What this card alone still owes, from its ledger. */
	@property({ attribute: false }) owed = 0;
	/** Paid money the card's statements could not spend, from its ledger. */
	@property({ attribute: false }) credit = 0;
	/** The oldest closed statement still owing, from `nextBill`. */
	@property({ attribute: false }) next: LedgerStatement | null = null;
	/** The card *Make a payment* opens the payment sheet on; empty for no button. */
	@property() payCardId = "";
	@property() today: PlainDate = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override render() {
		return html`${this.available()}${this.owedTile()}${this.nextTile()}`;
	}

	private available() {
		const room = this.room;
		if (!room) {
			return html`
				<section data-tile="available">
					<h2>${t("card.summary.available")}</h2>
					<p><small>${t("card.summary.noGroup")}</small></p>
				</section>
			`;
		}
		const { group } = room;
		// What lists hold counts as used, so the bar agrees with the room figure.
		const counted = room.used + room.held;
		const level = usageLevel(counted, group.limit);
		const share = usageShare(counted, group.limit);
		return html`
			<section data-tile="available" data-level=${level}>
				<h2>${t("card.summary.available")}</h2>
				<p class="figure">${formatAmount(room.room)}</p>
				<span class="usage" data-level=${level} title=${t("limits.usage", { share })}>
					<span style=${`inline-size: ${share}%`}></span>
				</span>
				<p><small>${t("card.summary.availableOf", {
					limit: formatAmount(group.limit),
					name: group.name,
				})}</small></p>
				${
					room.sharedWith > 0
						? html`<p><small>${
								room.sharedWith === 1
									? t("card.summary.sharedOne")
									: t("card.summary.shared", { count: room.sharedWith })
							}</small></p>`
						: nothing
				}
			</section>
		`;
	}

	private owedTile() {
		return html`
			<section data-tile="owed">
				<h2>${t("card.summary.owed")}</h2>
				<p class="figure">${formatAmount(this.owed)}</p>
				<p><small>${t("card.summary.owedHint")}</small></p>
				${
					this.credit > 0
						? html`<p><small data-testid="credit">${t("card.summary.credit", { amount: formatAmount(this.credit) })}</small></p>`
						: nothing
				}
				${
					this.payCardId
						? html`<button type="button" data-variant="quiet" data-action="pay"
								@click=${() => openPayment({ cardId: this.payCardId })}>${t("card.summary.pay")}</button>`
						: nothing
				}
			</section>
		`;
	}

	private nextTile() {
		const next = this.next;
		if (!next || next.total <= 0) {
			return html`
				<section data-tile="next">
					<h2>${t("card.summary.next")}</h2>
					<p class="figure">${t("card.summary.nothing")}</p>
				</section>
			`;
		}
		const urgency = ledgerUrgency(next, this.today);
		return html`
			<section data-tile="next" data-urgency=${urgency}>
				<h2>${t("card.summary.next")}</h2>
				<p class="figure">${formatAmount(next.remaining)}</p>
				<p><small>${
					urgency === "open"
						? t("card.summary.nextOpen", {
								date: displayDate(next.closeDate, getLocale()),
							})
						: t("card.summary.nextDate", {
								date: displayDate(next.dueDate, getLocale()),
							})
				}</small></p>
			</section>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-summary": CcCardSummary;
	}
}
