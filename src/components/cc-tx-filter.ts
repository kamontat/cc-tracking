import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { RangePreset } from "#lib/domain/purchase-range";
import {
	DEFAULT_TX_FILTER,
	type TxFilter,
	type TxSort,
} from "#lib/domain/transactions";
import type { Card } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { cardIdTag } from "#lib/ui/card-label";
import { base, cardBits, controls } from "#styles/shared";
import "#components/cc-modal";

const RANGES: RangePreset[] = ["today", "week", "month", "lastMonth", "custom"];
const SORTS: TxSort[] = ["new", "old", "big", "small"];
const TYPES = ["purchase", "payment"] as const;

const toggle = <T>(values: T[], value: T): T[] =>
	values.includes(value)
		? values.filter((v) => v !== value)
		: [...values, value];

/**
 * The filter sheet: a draft of the filter and sort that only the apply button hands back, with
 * the number of rows it would show (`count`) so a dead end is seen before it is applied.
 */
@customElement("cc-tx-filter")
export class CcTxFilter extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
		css`
			:host {
				display: contents;
			}

			fieldset {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
				min-inline-size: 0;
				padding: 0;
				border: 0;
			}

			legend {
				padding: 0;
				margin-bottom: var(--cc-space-1);
				font-size: var(--cc-text-sm);
				font-weight: 400;
				letter-spacing: normal;
				text-transform: none;
				color: var(--cc-text-muted);
			}

			.choices {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.choices button {
				padding: var(--cc-space-1) var(--cc-space-3);
				font-weight: 400;
				color: var(--cc-text);
				background: var(--cc-surface-sunken);
				border-color: transparent;
				border-radius: var(--cc-radius-pill);
			}

			.choices button:hover {
				background: var(--cc-border);
			}

			.choices button[aria-pressed="true"] {
				font-weight: 600;
				color: var(--cc-success);
				background: var(--cc-accent-surface);
			}

			.choices button[aria-pressed="true"] .card-meta {
				color: inherit;
			}

			.dates {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-3);
				margin-top: var(--cc-space-2);
			}

			.dates label {
				flex: 1 1 0;
			}

			.footer {
				display: flex;
				flex-direction: row;
				gap: var(--cc-space-2);
			}

			.footer button {
				padding-block: var(--cc-space-3);
				font-size: var(--cc-text-md);
				font-weight: 650;
			}

			.footer [data-action="apply"] {
				flex: 1 1 auto;
			}
		`,
	];

	@property({ attribute: false }) cards: Card[] = [];
	@property({ attribute: false }) filter: TxFilter = DEFAULT_TX_FILTER;
	@property() sort: TxSort = "new";
	@property({ attribute: false }) count: (
		filter: TxFilter,
		sort: TxSort,
	) => number = () => 0;
	@state() private draft: TxFilter = DEFAULT_TX_FILTER;
	@state() private draftSort: TxSort = "new";

	constructor() {
		super();
		new LocaleController(this);
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("filter")) this.draft = { ...this.filter };
		if (changed.has("sort")) this.draftSort = this.sort;
	}

	private set(patch: Partial<TxFilter>) {
		this.draft = { ...this.draft, ...patch };
	}

	private chip(
		attr: "type" | "card" | "range" | "sort",
		value: string,
		label: unknown,
		pressed: boolean,
		onClick: () => void,
	) {
		return html`<button type="button" data-variant="quiet"
			data-type=${attr === "type" ? value : nothing}
			data-card=${attr === "card" ? value : nothing}
			data-range=${attr === "range" ? value : nothing}
			data-sort=${attr === "sort" ? value : nothing}
			aria-pressed=${pressed} @click=${onClick}>${label}</button>`;
	}

	override render() {
		const shown = this.count(this.draft, this.draftSort);
		return html`<cc-modal sheet heading=${t("tx.filter.title")}
			@close=${(event: Event) => {
				event.stopPropagation();
				this.dispatchEvent(new CustomEvent("close"));
			}}>
			<fieldset>
				<legend>${t("tx.filter.type")}</legend>
				<div class="choices">${TYPES.map((type) =>
					this.chip(
						"type",
						type,
						t(type === "purchase" ? "tx.type.purchase" : "tx.type.payment"),
						this.draft.types.includes(type),
						() => this.set({ types: toggle(this.draft.types, type) }),
					),
				)}</div>
			</fieldset>
			<fieldset>
				<legend>${t("tx.filter.card")}</legend>
				<div class="choices">${this.cards.map((card) =>
					this.chip(
						"card",
						card.id,
						html`${card.name} <small class="card-meta">${cardIdTag(card.id)}</small>`,
						this.draft.cards.includes(card.id),
						() => this.set({ cards: toggle(this.draft.cards, card.id) }),
					),
				)}</div>
			</fieldset>
			<fieldset>
				<legend>${t("tx.filter.date")}</legend>
				<div class="choices">${RANGES.map((range) =>
					this.chip(
						"range",
						range,
						t(`tx.range.${range}`),
						this.draft.range === range,
						() => {
							const next = this.draft.range === range ? "" : range;
							this.set(
								next === "custom"
									? { range: next }
									: { range: next, from: "", to: "" },
							);
						},
					),
				)}</div>
				${
					this.draft.range === "custom"
						? html`<div class="dates">
							<label>${t("tx.filter.from")}
								<input type="date" name="from" .value=${this.draft.from}
									@input=${(e: Event) => this.set({ from: (e.target as HTMLInputElement).value })} /></label>
							<label>${t("tx.filter.to")}
								<input type="date" name="to" .value=${this.draft.to}
									@input=${(e: Event) => this.set({ to: (e.target as HTMLInputElement).value })} /></label>
						</div>`
						: nothing
				}
			</fieldset>
			<fieldset>
				<legend>${t("tx.filter.sort")}</legend>
				<div class="choices">${SORTS.map((sort) =>
					this.chip(
						"sort",
						sort,
						t(`tx.sort.${sort}`),
						this.draftSort === sort,
						() => {
							this.draftSort = sort;
						},
					),
				)}</div>
			</fieldset>
			<div class="footer">
				<button type="button" data-variant="quiet" data-action="clear"
					@click=${() => {
						this.draft = { ...DEFAULT_TX_FILTER, q: this.draft.q };
						this.draftSort = "new";
					}}>${t("tx.filter.clear")}</button>
				<button type="button" data-action="apply" ?disabled=${shown === 0}
					@click=${() =>
						this.dispatchEvent(
							new CustomEvent("apply", {
								detail: { filter: this.draft, sort: this.draftSort },
							}),
						)}>${
						shown === 0
							? t("tx.filter.nothing")
							: t(shown === 1 ? "tx.filter.show.one" : "tx.filter.show.many", {
									count: shown,
								})
					}</button>
			</div>
		</cc-modal>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-tx-filter": CcTxFilter;
	}
}
