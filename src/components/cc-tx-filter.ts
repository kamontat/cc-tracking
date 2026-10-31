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
import { cardLabelText } from "#lib/ui/card-label";
import { base, controls } from "#styles/shared";
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
		css`
			:host {
				display: contents;
			}

			fieldset {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
				min-inline-size: 0;
				padding: 0;
				border: 0;
			}

			legend {
				padding: 0;
				margin-bottom: var(--cc-space-2);
				font-size: var(--cc-text-sm);
				font-weight: 600;
				color: var(--cc-text-muted);
			}

			.choices {
				display: flex;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.dates {
				display: flex;
				flex-wrap: wrap;
				gap: var(--cc-space-3);
			}

			.dates label {
				flex: 1 1 0;
			}

			.footer {
				display: flex;
				flex-wrap: wrap;
				justify-content: space-between;
				gap: var(--cc-space-3);
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
		attr: "type" | "card" | "range",
		value: string,
		label: string,
		pressed: boolean,
		onClick: () => void,
	) {
		return html`<button type="button" data-variant=${pressed ? nothing : "quiet"}
			data-type=${attr === "type" ? value : nothing}
			data-card=${attr === "card" ? value : nothing}
			data-range=${attr === "range" ? value : nothing}
			aria-pressed=${pressed} @click=${onClick}>${label}</button>`;
	}

	override render() {
		const shown = this.count(this.draft, this.draftSort);
		return html`<cc-modal heading=${t("tx.filter.title")}
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
						cardLabelText(card.id, card),
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
			<label>${t("tx.filter.sort")}
				<select name="sort" @change=${(e: Event) => {
					this.draftSort = (e.target as HTMLSelectElement).value as TxSort;
				}}>${SORTS.map(
					(sort) =>
						html`<option value=${sort} .selected=${this.draftSort === sort}>${t(`tx.sort.${sort}`)}</option>`,
				)}</select>
			</label>
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
