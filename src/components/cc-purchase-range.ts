import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { filterChip } from "#components/list-controls";
import { displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import {
	type DateRange,
	presetRange,
	purchasesInRange,
	type RangePreset,
	rangeSummary,
} from "#lib/domain/purchase-range";
import type { Card, PlainDate, Purchase } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { badge, base, controls, dataTable, listControls } from "#styles/shared";

const PRESETS: { preset: RangePreset; label: MessageKey }[] = [
	{ preset: "today", label: "range.preset.today" },
	{ preset: "week", label: "range.preset.week" },
	{ preset: "month", label: "range.preset.month" },
	{ preset: "lastMonth", label: "range.preset.lastMonth" },
	{ preset: "custom", label: "range.preset.custom" },
];

/**
 * How many purchases fall within a range of purchase dates, and how much they come to, across
 * every card. Archived cards count: archiving a card later must not rewrite what was bought then.
 */
@customElement("cc-purchase-range")
export class CcPurchaseRange extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		listControls,
		badge,
		css`
			.presets,
			.custom {
				flex-wrap: wrap;
				align-items: center;
				gap: var(--cc-space-2);
			}

			.custom {
				margin-block-start: var(--cc-space-2);
			}

			.presets button[aria-pressed="true"] {
				color: var(--cc-accent-text);
				background: var(--cc-accent);
				border-color: var(--cc-accent);
			}

			.tiles {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(var(--cc-space-7), 1fr));
				gap: var(--cc-space-3);
				margin-block: var(--cc-space-4);
			}

			.tile {
				padding: var(--cc-space-3);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-md);
			}

			.tile strong {
				display: block;
				font-size: var(--cc-text-lg);
				font-variant-numeric: tabular-nums;
			}

			.tile span {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			summary {
				cursor: pointer;
				color: var(--cc-link);
			}

			td.day {
				padding-block-start: var(--cc-space-4);
				font-weight: 600;
				color: var(--cc-text-muted);
			}

			.empty {
				color: var(--cc-text-muted);
			}
		`,
	];

	/** Every purchase, archived cards' included. */
	@property({ attribute: false }) purchases: Purchase[] = [];
	/** Every card, archived ones included, to name the purchases and fill the filter. */
	@property({ attribute: false }) cards: Card[] = [];
	@property() today: PlainDate = "";

	@state() private preset: RangePreset = "month";
	@state() private custom: DateRange = { from: "", to: "" };
	@state() private cardId = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	private get range(): DateRange {
		return this.preset === "custom"
			? this.custom
			: presetRange(this.preset, this.today);
	}

	private choose(preset: RangePreset) {
		// Custom starts from whatever was showing, so the reader nudges a range rather than
		// typing two dates from scratch.
		if (preset === "custom" && this.preset !== "custom") {
			this.custom = this.range;
		}
		this.preset = preset;
	}

	private card(cardId: string): Card | undefined {
		return this.cards.find((card) => card.id === cardId);
	}

	private cardChoices() {
		const ordered = [
			...this.cards.filter((card) => !card.archived),
			...this.cards.filter((card) => card.archived),
		];
		return ordered.map((card) => ({
			value: card.id,
			text: card.archived
				? `${card.id} — ${card.name} (${t("range.archived")})`
				: `${card.id} — ${card.name}`,
		}));
	}

	private rows(list: Purchase[]) {
		let day = "";
		return list.flatMap((entry) => {
			const card = this.card(entry.cardId);
			const heading =
				entry.date === day
					? []
					: [
							html`<tr><td class="day" colspan="3" data-testid="range-day">${displayDate(entry.date, getLocale())}</td></tr>`,
						];
			day = entry.date;
			return [
				...heading,
				html`<tr data-testid="range-row">
					<td>${card ? `${card.id} — ${card.name}` : entry.cardId}
						${card?.archived ? html`<span class="badge" data-testid="archived-tag">${t("range.archived")}</span>` : nothing}</td>
					<td>${entry.note || nothing}</td>
					<td data-numeric>${formatAmount(entry.amount)}</td>
				</tr>`,
			];
		});
	}

	override render() {
		const list = purchasesInRange(
			this.purchases,
			this.range,
			this.cardId || undefined,
		);
		const summary = rangeSummary(list);
		return html`
			<div class="toolbar" row>
				<div class="presets" row>
					${PRESETS.map(
						({
							preset,
							label,
						}) => html`<button type="button" data-variant="quiet"
							data-preset=${preset} aria-pressed=${this.preset === preset ? "true" : "false"}
							@click=${() => this.choose(preset)}>${t(label)}</button>`,
					)}
				</div>
				${filterChip(
					"card",
					t("range.card"),
					this.cardId,
					this.cardChoices(),
					(value) => {
						this.cardId = value;
					},
				)}
			</div>
			${
				this.preset === "custom"
					? html`<div class="custom" row>
						<label>${t("range.from")} <input type="date" name="from" .value=${this.custom.from}
							@input=${(event: Event) => {
								this.custom = {
									...this.custom,
									from: (event.target as HTMLInputElement).value,
								};
							}} /></label>
						<label>${t("range.to")} <input type="date" name="to" .value=${this.custom.to}
							@input=${(event: Event) => {
								this.custom = {
									...this.custom,
									to: (event.target as HTMLInputElement).value,
								};
							}} /></label>
					</div>`
					: nothing
			}
			<div class="tiles">
				<div class="tile"><strong data-testid="range-count">${summary.count}</strong><span>${t("range.count")}</span></div>
				<div class="tile"><strong data-testid="range-total">${formatAmount(summary.total)}</strong><span>${t("range.total")}</span></div>
				<div class="tile"><strong data-testid="range-cards">${summary.cards}</strong><span>${t("range.cards")}</span></div>
			</div>
			${
				list.length === 0
					? html`<p class="empty">${t("range.empty")}</p>`
					: html`<details>
						<summary>${t("range.show", { count: summary.count })}</summary>
						<table><tbody>${this.rows(list)}</tbody></table>
					</details>`
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-purchase-range": CcPurchaseRange;
	}
}
