import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { headerDate } from "#lib/domain/date";
import type { NeedsItem } from "#lib/domain/home";
import { formatAmount } from "#lib/domain/money";
import type { Card, LimitGroup } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { cardLine, cardLines, cardMini } from "#lib/ui/card-label";
import { icons } from "#lib/ui/icons";
import { listPageAddress } from "#lib/ui/list-address";
import { payAddress } from "#lib/ui/pay-address";
import { base, cardBits } from "#styles/shared";

/** What needs doing on Home: replies to record, bills past due, drafts to finish. */
@customElement("cc-needs-you")
export class CcNeedsYou extends LitElement {
	static override styles = [
		base,
		cardBits,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			h1 {
				font-size: var(--cc-text-2xl);
				font-weight: 700;
			}

			.list {
				display: flex;
				flex-direction: column;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				box-shadow: var(--cc-shadow-sm);
				overflow: hidden;
			}

			.item {
				display: flex;
				flex-direction: row;
				align-items: center;
				gap: var(--cc-space-3);
				padding: var(--cc-space-3) var(--cc-panel-padding);
				color: inherit;
				text-decoration: none;
			}

			.item + .item {
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			.item:hover {
				background: var(--cc-surface-sunken);
			}

			.chip {
				display: grid;
				place-items: center;
				flex: none;
				inline-size: var(--cc-space-7);
				block-size: var(--cc-space-7);
				border-radius: var(--cc-radius-pill);
				background: var(--cc-surface-sunken);
			}

			.item[data-item="overdue"] .chip {
				background: var(--cc-danger-surface);
				color: var(--cc-danger);
			}

			.item[data-item="waiting"] .chip {
				background: var(--cc-warning-surface);
			}

			.chip .icon {
				inline-size: var(--cc-icon-size);
				block-size: var(--cc-icon-size);
			}

			.text {
				display: flex;
				flex-direction: column;
				flex: 1;
				min-inline-size: 0;
			}

			/* A card's row starts its title with the card's chip (the panel form, UI-14). */
			.text .mini {
				vertical-align: middle;
			}

			small {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.chevron {
				color: var(--cc-text-muted);
				font-size: var(--cc-text-lg);
			}

			.note {
				padding: var(--cc-space-3) var(--cc-space-4);
				border-radius: var(--cc-radius-sm);
				background: var(--cc-surface-sunken);
			}

			.note[data-tone="ok"] {
				background: var(--cc-accent-surface);
			}
		`,
	];

	@property({ attribute: false }) items: NeedsItem[] = [];
	/** Every stored card, to name a draft's cards. */
	@property({ attribute: false }) cards: Card[] = [];
	/** The stored limit groups, in order: a card's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];

	constructor() {
		super();
		new LocaleController(this);
	}

	private row(item: NeedsItem) {
		const locale = getLocale();
		switch (item.kind) {
			case "waiting":
				return {
					href: listPageAddress(item.list),
					icon: icons.clock,
					title: t("home.waiting"),
					detail: t(
						item.list.lines.length === 1
							? "home.waitingDetail.one"
							: "home.waitingDetail.many",
						{
							date: headerDate(item.list.date, locale, false),
							count: item.list.lines.length,
							total: formatAmount(item.total),
						},
					),
				};
			case "overdue":
				return {
					href: payAddress({ cardId: item.card.id, amount: item.remaining }),
					icon: icons.alert,
					chip: cardMini(item.card, this.groups),
					title: t(item.days === 1 ? "home.overdue.one" : "home.overdue.many", {
						card: cardLine(item.card.id, item.card, { short: true }),
						days: item.days,
					}),
					detail: t("home.overdueDetail", {
						amount: formatAmount(item.remaining),
					}),
				};
			case "planned":
				return {
					href: "/transactions",
					icon: icons.clock,
					chip: cardMini(item.card, this.groups),
					title: t("home.planned", {
						card: cardLine(item.payment.cardId, item.card, { short: true }),
						date: headerDate(item.payment.date, locale, false),
					}),
					detail: t("home.plannedDetail", {
						amount: formatAmount(item.payment.amount),
					}),
				};
			case "draft":
				return {
					href: listPageAddress(item.list),
					icon: icons.transactions,
					title: t("home.draft", {
						date: headerDate(item.list.date, locale, false),
					}),
					detail: `${cardLines(
						item.list.lines.map((l) => l.cardId),
						this.cards,
						{ short: true },
					)} · ${formatAmount(item.total)}`,
				};
		}
	}

	override render() {
		if (this.items.length === 0) {
			return html`
				<h1>${t("home.caughtUp")}</h1>
				<p class="note" data-tone="ok">${t("home.caughtUpDetail")}</p>
			`;
		}
		const count = this.items.length;
		return html`
			<h1>${count === 1 ? t("home.needs.one") : t("home.needs.many", { count })}</h1>
			<div class="list">
				${this.items.map((item) => {
					const row = this.row(item);
					const inside = html`<span class="chip">${row.icon}</span>
						<span class="text"><b>${"chip" in row ? html`${row.chip} ` : ""}${row.title}</b><small>${row.detail}</small></span>
						<span class="chevron" aria-hidden="true">›</span>`;
					// An overdue bill leads to the payment sheet on its card and what is left.
					return html`<a class="item" data-item=${item.kind} href=${row.href}>${inside}</a>`;
				})}
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-needs-you": CcNeedsYou;
	}
}
