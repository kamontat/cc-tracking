import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date";
import { usageLevel, usageShare } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import { urgencyOf } from "#lib/domain/statement";
import type { LimitGroup, PlainDate, Statement } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { base, usageBar } from "#styles/shared";

/**
 * The three answers someone opens a card's page for, above its history: how much room is
 * left to spend, what this card owes, and what falls due next. Every figure arrives computed;
 * this only lays them out.
 */
@customElement("cc-card-summary")
export class CcCardSummary extends LitElement {
	static override styles = [
		base,
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

	@property({ attribute: false }) group: LimitGroup | null = null;
	/** Unpaid total across every card in the group, from `groupUsage`. */
	@property({ attribute: false }) used = 0;
	/** How many other cards draw on the same group. */
	@property({ attribute: false }) sharedWith = 0;
	/** What this card alone still owes, from `outstandingOf`. */
	@property({ attribute: false }) owed = 0;
	/** The statement needing attention, from `nextActionable`. */
	@property({ attribute: false }) next: Statement | null = null;
	@property() today: PlainDate = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override render() {
		return html`${this.available()}${this.owedTile()}${this.nextTile()}`;
	}

	private available() {
		const group = this.group;
		if (!group) {
			return html`
				<section data-tile="available">
					<h2>${t("card.summary.available")}</h2>
					<p><small>${t("card.summary.noGroup")}</small></p>
				</section>
			`;
		}
		const level = usageLevel(this.used, group.limit);
		const share = usageShare(this.used, group.limit);
		return html`
			<section data-tile="available" data-level=${level}>
				<h2>${t("card.summary.available")}</h2>
				<p class="figure">${formatAmount(group.limit - this.used)}</p>
				<span class="usage" data-level=${level} title=${t("limits.usage", { share })}>
					<span style=${`inline-size: ${share}%`}></span>
				</span>
				<p><small>${t("card.summary.availableOf", {
					limit: formatAmount(group.limit),
					name: group.name,
				})}</small></p>
				${
					this.sharedWith > 0
						? html`<p><small>${
								this.sharedWith === 1
									? t("card.summary.sharedOne")
									: t("card.summary.shared", { count: this.sharedWith })
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
		const urgency = urgencyOf(next, this.today);
		return html`
			<section data-tile="next" data-urgency=${urgency}>
				<h2>${t("card.summary.next")}</h2>
				<p class="figure">${formatAmount(next.total)}</p>
				<p><small>${
					urgency === "future"
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
