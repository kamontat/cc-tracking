import { html, LitElement, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
	CARDS_SORTS,
	type CardsSort,
	type CardsView,
	DEFAULT_CARDS_VIEW,
} from "#lib/domain/cards-view";
import { LOCATIONS, type Location } from "#lib/domain/location";
import { OWNERS } from "#lib/domain/owner";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
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
 * holder* and *Sort*, then *Clear all* and *Show N cards*. A draft of the view that only the
 * apply button hands back (`apply`, the whole view), counted live by `count`.
 */
@customElement("cc-cards-filter")
export class CcCardsFilter extends LitElement {
	static override styles = [base, controls, filterSheet];

	@property({ attribute: false }) view: CardsView = DEFAULT_CARDS_VIEW;
	/** The places to offer, in order. */
	@property({ attribute: false }) locations: readonly Location[] = LOCATIONS;
	/** How the page names a place. */
	@property({ attribute: false }) locationName: (id: string) => string = (id) =>
		locationText(id as Location);
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
			},
			html`
			<fieldset>
				<legend>${t("ready.filter.location")}</legend>
				<div class="choices">${this.locations.map((location) =>
					sheetChip(
						"location",
						location,
						this.locationName(location),
						draft.locations.includes(location),
						() => this.set({ locations: toggle(draft.locations, location) }),
					),
				)}</div>
			</fieldset>
			<fieldset>
				<legend>${t("ready.filter.owner")}</legend>
				<div class="choices">${OWNERS.map((owner) =>
					sheetChip("owner", owner, owner, draft.owners.includes(owner), () =>
						this.set({ owners: toggle(draft.owners, owner) }),
					),
				)}</div>
			</fieldset>
			<fieldset>
				<legend>${t("tx.filter.sort")}</legend>
				<div class="choices">${CARDS_SORTS.map((sort) =>
					sheetChip(
						"sort",
						sort,
						cardsSortLabel(sort),
						draft.sort === sort,
						() => this.set({ sort }),
					),
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
