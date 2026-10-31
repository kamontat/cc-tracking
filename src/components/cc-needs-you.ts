import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { headerDate } from "#lib/domain/date";
import type { NeedsItem } from "#lib/domain/home";
import { formatAmount } from "#lib/domain/money";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { icons } from "#lib/ui/icons";
import { base } from "#styles/shared";

/** What needs doing on Home: replies to record, bills past due, drafts to finish. */
@customElement("cc-needs-you")
export class CcNeedsYou extends LitElement {
	static override styles = [
		base,
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

	constructor() {
		super();
		new LocaleController(this);
	}

	private row(item: NeedsItem) {
		const locale = getLocale();
		switch (item.kind) {
			case "waiting":
				return {
					href: `/list?id=${item.list.id}`,
					icon: icons.clock,
					title: t("home.waiting"),
					detail: t("home.waitingDetail", {
						date: headerDate(item.list.date, locale, false),
						count: item.list.lines.length,
						total: formatAmount(item.total),
					}),
				};
			case "overdue":
				return {
					href: `/card?id=${encodeURIComponent(item.card.id)}`,
					icon: icons.alert,
					title: t("home.overdue", { card: item.card.id, days: item.days }),
					detail: t("home.overdueDetail", {
						amount: formatAmount(item.remaining),
					}),
				};
			case "draft":
				return {
					href: `/list?id=${item.list.id}`,
					icon: icons.transactions,
					title: t("home.draft", {
						date: headerDate(item.list.date, locale, false),
					}),
					detail: `${item.list.lines.map((l) => l.cardId).join(", ")} · ${formatAmount(item.total)}`,
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
					return html`
						<a class="item" data-item=${item.kind} href=${row.href}>
							<span class="chip">${row.icon}</span>
							<span class="text"><b>${row.title}</b><small>${row.detail}</small></span>
							<span class="chevron" aria-hidden="true">›</span>
						</a>
					`;
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
