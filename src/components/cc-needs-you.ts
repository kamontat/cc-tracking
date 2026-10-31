import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
	actionRow,
	actionRowStyles,
	draftText,
	overdueText,
	plannedText,
	waitingText,
} from "#components/action-row";
import type { NeedsItem } from "#lib/domain/home";
import { formatAmount } from "#lib/domain/money";
import { listTotal } from "#lib/domain/purchase-list";
import type { Card, LimitGroup, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { listPageAddress } from "#lib/ui/list-address";
import { payAddress } from "#lib/ui/pay-address";
import { base, controls, rowPanel } from "#styles/shared";

const MINUS = "−";

/** How many things show before *See more*. */
const SHOWN = 5;

/**
 * What needs doing on Home, money at risk first (DD-62): bills past due, late plans, replies
 * to record, payments planned soon, drafts to finish. Each is the shared action row (DD-108):
 * its icon says the kind, and the whole row opens the item; the amount sits on the right
 * (DD-111), with no button. More than five show the first five and *See more (N)*, which opens the rest in
 * place, in the same order.
 */
@customElement("cc-needs-you")
export class CcNeedsYou extends LitElement {
	static override styles = [
		base,
		controls,
		rowPanel,
		actionRowStyles,
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

			.panel {
				box-shadow: var(--cc-shadow-sm);
			}

			.note {
				padding: var(--cc-space-3) var(--cc-space-4);
				border-radius: var(--cc-radius-sm);
				background: var(--cc-surface-sunken);
			}

			.more {
				align-self: center;
			}

			.note[data-tone="ok"] {
				background: var(--cc-accent-surface);
			}
		`,
	];

	@property({ attribute: false }) items: NeedsItem[] = [];
	/** Every stored card, to name a draft's cards. */
	@property({ attribute: false }) cards: Card[] = [];
	/** Every stored limit group, to say whose card it is (DR-13). */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** Today, to say how far off a planned payment is. */
	@property() today: PlainDate = "";

	/** Whether the things past the first `SHOWN` are open (DD-106). */
	@state() private expanded = false;

	constructor() {
		super();
		new LocaleController(this);
	}

	private row(item: NeedsItem) {
		switch (item.kind) {
			case "waiting":
				return actionRow(waitingText(item.list, this.cards, this.groups), {
					href: listPageAddress(item.list),
					amount: {
						text: `${MINUS}${formatAmount(listTotal(item.list))}`,
						tone: "muted",
					},
				});
			case "overdue":
				// An overdue bill leads to the payment sheet on its card and what is left.
				return actionRow(overdueText(item.card, this.groups, item.days), {
					href: payAddress({ cardId: item.card.id, amount: item.remaining }),
					amount: { text: formatAmount(item.remaining), tone: "danger" },
				});
			case "planned":
				return actionRow(
					plannedText(item.payment, item.card, this.groups, this.today, false),
					{
						href: "/transactions",
						amount: {
							text: `+${formatAmount(item.payment.amount)}`,
							tone: "in",
						},
					},
				);
			case "draft":
				return actionRow(draftText(item.list, this.cards, this.groups), {
					href: listPageAddress(item.list),
					amount: {
						text: `${MINUS}${formatAmount(listTotal(item.list))}`,
						tone: "muted",
					},
				});
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
			<div class="panel" id="needs-list">
				${(this.expanded ? this.items : this.items.slice(0, SHOWN)).map(
					(item) => this.row(item),
				)}
			</div>
			${
				count > SHOWN
					? html`<button type="button" class="more" data-variant="quiet" data-action="more"
							aria-controls="needs-list" aria-expanded=${this.expanded ? "true" : "false"}
							@click=${() => {
								this.expanded = !this.expanded;
							}}>${
								this.expanded
									? t("home.needs.less")
									: t("home.needs.more", { count: count - SHOWN })
							}</button>`
					: nothing
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-needs-you": CcNeedsYou;
	}
}
