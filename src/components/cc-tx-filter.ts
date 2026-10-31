import { html, LitElement, nothing, type PropertyValues } from "lit";
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
import { cardLine } from "#lib/ui/card-label";
import { base, cardBits, controls, filterSheet } from "#styles/shared";
import { filterSheetFrame, sheetChip, toggle } from "./filter-sheet";

const RANGES: RangePreset[] = ["today", "week", "month", "lastMonth", "custom"];
const SORTS: TxSort[] = ["new", "old", "big", "small"];
const TYPES = ["purchase", "payment"] as const;

/**
 * The filter sheet: a draft of the filter and sort that only the apply button hands back, with
 * the number of rows it would show (`count`) so a dead end is seen before it is applied.
 */
@customElement("cc-tx-filter")
export class CcTxFilter extends LitElement {
	static override styles = [base, controls, cardBits, filterSheet];

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

	override render() {
		const shown = this.count(this.draft, this.draftSort);
		return filterSheetFrame(
			{
				host: this,
				shown,
				showLabel: t(
					shown === 1 ? "tx.filter.show.one" : "tx.filter.show.many",
					{ count: shown },
				),
				onClear: () => {
					this.draft = { ...DEFAULT_TX_FILTER, q: this.draft.q };
					this.draftSort = "new";
				},
				detail: () => ({ filter: this.draft, sort: this.draftSort }),
			},
			html`
			<fieldset>
				<legend>${t("tx.filter.type")}</legend>
				<div class="choices">${TYPES.map((type) =>
					sheetChip(
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
					sheetChip(
						"card",
						card.id,
						cardLine(card.id, card),
						this.draft.cards.includes(card.id),
						() => this.set({ cards: toggle(this.draft.cards, card.id) }),
					),
				)}</div>
			</fieldset>
			<fieldset>
				<legend>${t("tx.filter.date")}</legend>
				<div class="choices">${RANGES.map((range) =>
					sheetChip(
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
					sheetChip(
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
			`,
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-tx-filter": CcTxFilter;
	}
}
