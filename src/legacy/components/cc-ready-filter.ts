import type { Owner } from "#lib/domain/owner"
import type { LocationRecord } from "#lib/domain/types"

import { html, LitElement, nothing, type PropertyValues } from "lit"
import { customElement, property, state } from "lit/decorators.js"

import { LocaleController } from "#legacy/lib/i18n/controller"
import { base, controls, filterSheet } from "#legacy/styles/shared"
import { READY_SORTS, type ReadySort } from "#lib/domain/home"
import { DEFAULT_READY_FILTER, type ReadyFilter } from "#lib/domain/ready-filter"
import { nameOfLocation } from "#lib/i18n/format"
import { t } from "#lib/i18n/index"
import { filterSheetFrame, sheetChip, toggle } from "./filter-sheet"

/**
 * The new-list picker's filter sheet (DD-103), drawn like Transactions' (`filterSheet`): *Kept
 * in* (the places the ready cards are kept in), *Account holder* and *Sort*, then *Clear all*
 * and *Show N cards*. A draft only the apply button hands back, counted live by `count`.
 */
@customElement("cc-ready-filter")
export class CcReadyFilter extends LitElement {
	static override styles = [base, controls, filterSheet]

	/** The ids of the places to offer, in order: those the ready cards are kept in. */
	@property({ attribute: false }) locations: string[] = []
	/** The stored locations, which name the places offered. */
	@property({ attribute: false }) records: LocationRecord[] = []
	/** The account holders to offer: those of the ready cards. */
	@property({ attribute: false }) owners: Owner[] = []
	@property({ attribute: false }) filter: ReadyFilter = DEFAULT_READY_FILTER
	@property() sort: ReadySort = "room"
	@property({ attribute: false }) count: (filter: ReadyFilter) => number = () => 0
	@state() private draft: ReadyFilter = DEFAULT_READY_FILTER
	@state() private draftSort: ReadySort = "room"

	constructor() {
		super()
		new LocaleController(this)
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("filter")) this.draft = { ...this.filter }
		if (changed.has("sort")) this.draftSort = this.sort
	}

	override render() {
		const shown = this.count(this.draft)
		const { draft } = this
		return filterSheetFrame(
			{
				host: this,
				shown,
				showLabel: t(shown === 1 ? "ready.filter.show.one" : "ready.filter.show.many", { count: shown }),
				onClear: () => {
					this.draft = { ...DEFAULT_READY_FILTER, q: draft.q }
					this.draftSort = "room"
				},
				detail: () => ({ filter: this.draft, sort: this.draftSort }),
			},
			html`
			${
				this.locations.length > 0
					? html`<fieldset>
						<legend>${t("ready.filter.location")}</legend>
						<div class="choices">${this.locations.map((location) =>
							sheetChip(
								"location",
								location,
								nameOfLocation(this.records, location),
								draft.locations.includes(location),
								() => {
									this.draft = {
										...draft,
										locations: toggle(draft.locations, location),
									}
								},
							),
						)}</div>
					</fieldset>`
					: nothing
			}
			${
				this.owners.length > 0
					? html`<fieldset>
						<legend>${t("ready.filter.owner")}</legend>
						<div class="choices">${this.owners.map((owner) =>
							sheetChip("owner", owner, owner, draft.owners.includes(owner), () => {
								this.draft = {
									...draft,
									owners: toggle(draft.owners, owner),
								}
							}),
						)}</div>
					</fieldset>`
					: nothing
			}
			<fieldset>
				<legend>${t("tx.filter.sort")}</legend>
				<div class="choices">${READY_SORTS.map((sort) =>
					sheetChip("sort", sort, t(`ready.sort.${sort}`), this.draftSort === sort, () => {
						this.draftSort = sort
					}),
				)}</div>
			</fieldset>
			`,
		)
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-filter": CcReadyFilter
	}
}
