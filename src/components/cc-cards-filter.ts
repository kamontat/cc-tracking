import { css, html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
	CARDS_SORTS,
	type CardsSort,
	type CardsView,
	DEFAULT_CARDS_VIEW,
} from "#lib/domain/cards-view";
import { OWNERS } from "#lib/domain/owner";
import type { LocationRecord } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { locationName, sortLocations } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, controls, filterSheet } from "#styles/shared";
import { filterSheetFrame, sheetChip, toggle } from "./filter-sheet";

const SORT_KEYS = {
	place: "cards.sort.place",
	room: "cards.sort.room",
	name: "cards.sort.name",
	close: "cards.sort.closeDay",
} as const satisfies Record<CardsSort, string>;

/** A Cards sort's own words, for the sheet and the page's sort chip. */
export const cardsSortLabel = (sort: CardsSort): string => t(SORT_KEYS[sort]);

/**
 * The Cards page's filter sheet, drawn like Transactions' (`filterSheet`): *Kept in*, *Account
 * holder* and *Sort by* (a radio list), under the heading *Filter cards*, then *Clear all* and
 * *Show N cards*. A draft of the view that only the
 * apply button hands back (`apply`, the whole view), counted live by `count`.
 */
@customElement("cc-cards-filter")
export class CcCardsFilter extends LitElement {
	static override styles = [
		base,
		controls,
		filterSheet,
		css`
			/* The sort as a radio list (the prototype's filter sheet): one row per sort on a panel,
			   its words on the left and the radio mark on the right. */
			.set {
				display: flex;
				flex-direction: column;
				padding: 0 var(--cc-space-4);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}

			.set > label {
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-3);
				padding: var(--cc-space-3) 0;
				color: var(--cc-text);
				cursor: pointer;
			}

			.set > label + label {
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			.set input[type="radio"] {
				flex: none;
				inline-size: var(--cc-space-5);
				block-size: var(--cc-space-5);
				margin: 0;
				appearance: none;
				cursor: pointer;
				background: var(--cc-surface);
				border: var(--cc-ring-width) solid var(--cc-border);
				border-radius: var(--cc-radius-pill);
			}

			.set input[type="radio"]:checked {
				border: var(--cc-space-2) solid var(--cc-accent);
			}

			@media (forced-colors: active) {
				.set input[type="radio"] {
					appearance: auto;
				}
			}
		`,
	];

	@property({ attribute: false }) view: CardsView = DEFAULT_CARDS_VIEW;
	/** The stored locations, every one offered, A to Z by shown name. */
	@property({ attribute: false }) locations: LocationRecord[] = [];
	@property({ attribute: false }) count: (view: CardsView) => number = () => 0;
	@state() private draft: CardsView = DEFAULT_CARDS_VIEW;

	constructor() {
		super();
		new LocaleController(this);
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("view")) this.draft = { ...this.view };
	}

	private set(patch: Partial<CardsView>) {
		this.draft = { ...this.draft, ...patch };
	}

	override render() {
		const { draft } = this;
		const shown = this.count(draft);
		return filterSheetFrame(
			{
				host: this,
				shown,
				showLabel: t(
					shown === 1 ? "ready.filter.show.one" : "ready.filter.show.many",
					{ count: shown },
				),
				onClear: () => {
					this.draft = { ...DEFAULT_CARDS_VIEW, q: draft.q };
				},
				detail: () => ({ ...this.draft }),
				title: t("cards.filter.title"),
			},
			html`
			<fieldset>
				<legend>${t("ready.filter.location")}</legend>
				<div class="choices">${sortLocations(this.locations).map((record) =>
					sheetChip(
						"location",
						record.id,
						locationName(record),
						draft.locations.includes(record.id),
						() => this.set({ locations: toggle(draft.locations, record.id) }),
					),
				)}</div>
			</fieldset>
			<fieldset>
				<legend>${t("ready.filter.owner")}</legend>
				<div class="choices">${OWNERS.map((owner) =>
					sheetChip("owner", owner, owner, draft.owners.includes(owner), () =>
						this.set({ owners: toggle(draft.owners, owner) }),
					),
				)}${sheetChip(
					"ungrouped",
					"",
					t("cards.filter.ungrouped"),
					draft.ungrouped,
					() => this.set({ ungrouped: !draft.ungrouped }),
				)}</div>
			</fieldset>
			<fieldset>
				<legend id="sort-legend">${t("cards.filter.sortBy")}</legend>
				<div class="set" role="radiogroup" aria-labelledby="sort-legend">${CARDS_SORTS.map(
					(sort) => html`<label><span>${cardsSortLabel(sort)}</span><input
						type="radio" name="sort" value=${sort} .checked=${draft.sort === sort}
						@change=${() => this.set({ sort })} /></label>`,
				)}</div>
			</fieldset>
			`,
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-cards-filter": CcCardsFilter;
	}
}
