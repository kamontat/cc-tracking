import { html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { READY_SORTS, type ReadySort } from "#lib/domain/home";
import type { Location } from "#lib/domain/location";
import type { Owner } from "#lib/domain/owner";
import {
	DEFAULT_READY_FILTER,
	type ReadyFilter,
} from "#lib/domain/ready-filter";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, controls, filterSheet } from "#styles/shared";
import "#components/cc-modal";

const toggle = <T>(values: T[], value: T): T[] =>
	values.includes(value)
		? values.filter((v) => v !== value)
		: [...values, value];

/**
 * The new-list picker's filter sheet (DD-103), drawn like Transactions' (`filterSheet`): *Kept
 * in* (the places the ready cards are kept in), *Account holder* and *Sort*, then *Clear all*
 * and *Show N cards*. A draft only the apply button hands back, counted live by `count`.
 */
@customElement("cc-ready-filter")
export class CcReadyFilter extends LitElement {
	static override styles = [base, controls, filterSheet];

	/** The places to offer: those the ready cards are kept in. */
	@property({ attribute: false }) locations: Location[] = [];
	/** The account holders to offer: those of the ready cards. */
	@property({ attribute: false }) owners: Owner[] = [];
	@property({ attribute: false }) filter: ReadyFilter = DEFAULT_READY_FILTER;
	@property() sort: ReadySort = "room";
	@property({ attribute: false }) count: (filter: ReadyFilter) => number = () =>
		0;
	@state() private draft: ReadyFilter = DEFAULT_READY_FILTER;
	@state() private draftSort: ReadySort = "room";

	constructor() {
		super();
		new LocaleController(this);
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("filter")) this.draft = { ...this.filter };
		if (changed.has("sort")) this.draftSort = this.sort;
	}

	private chip(
		attr: "location" | "owner" | "sort",
		value: string,
		label: string,
		pressed: boolean,
		onClick: () => void,
	) {
		return html`<button type="button" data-variant="quiet"
			data-location=${attr === "location" ? value : nothing}
			data-owner=${attr === "owner" ? value : nothing}
			data-sort=${attr === "sort" ? value : nothing}
			aria-pressed=${pressed} @click=${onClick}>${label}</button>`;
	}

	override render() {
		const shown = this.count(this.draft);
		const { draft } = this;
		return html`<cc-modal sheet heading=${t("tx.filter.title")}
			@close=${(event: Event) => {
				event.stopPropagation();
				this.dispatchEvent(new CustomEvent("close"));
			}}>
			${
				this.locations.length > 0
					? html`<fieldset>
						<legend>${t("ready.filter.location")}</legend>
						<div class="choices">${this.locations.map((location) =>
							this.chip(
								"location",
								location,
								locationText(location),
								draft.locations.includes(location),
								() => {
									this.draft = {
										...draft,
										locations: toggle(draft.locations, location),
									};
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
							this.chip(
								"owner",
								owner,
								owner,
								draft.owners.includes(owner),
								() => {
									this.draft = {
										...draft,
										owners: toggle(draft.owners, owner),
									};
								},
							),
						)}</div>
					</fieldset>`
					: nothing
			}
			<fieldset>
				<legend>${t("tx.filter.sort")}</legend>
				<div class="choices">${READY_SORTS.map((sort) =>
					this.chip(
						"sort",
						sort,
						t(`ready.sort.${sort}`),
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
						this.draft = { ...DEFAULT_READY_FILTER, q: draft.q };
						this.draftSort = "room";
					}}>${t("tx.filter.clear")}</button>
				<button type="button" data-action="apply" ?disabled=${shown === 0}
					@click=${(event: Event) => {
						// The sheet slides away first; the page takes it away on apply.
						const detail = { filter: this.draft, sort: this.draftSort };
						const sheet = (event.currentTarget as HTMLElement).closest(
							"cc-modal",
						);
						const apply = () =>
							this.dispatchEvent(new CustomEvent("apply", { detail }));
						if (sheet) sheet.leave(apply);
						else apply();
					}}>${
						shown === 0
							? t("tx.filter.nothing")
							: t(
									shown === 1
										? "ready.filter.show.one"
										: "ready.filter.show.many",
									{ count: shown },
								)
					}</button>
			</div>
		</cc-modal>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-ready-filter": CcReadyFilter;
	}
}
