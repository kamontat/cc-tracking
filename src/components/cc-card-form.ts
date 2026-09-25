import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { byOwnerThenName } from "#lib/domain/list-view";
import { DEFAULT_LOCATION, LOCATIONS, toLocation } from "#lib/domain/location";
import { groupLabel, OWNERS, type Owner, toOwner } from "#lib/domain/owner";
import type { Card, CycleRule, LimitGroup } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

@customElement("cc-card-form")
export class CcCardForm extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			form {
				display: grid;
				grid-template-columns: 1fr;
				gap: var(--cc-space-3);
			}

			@media (min-width: 640px) {
				form {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}

				fieldset,
				.form-actions,
				p[role="alert"] {
					grid-column: 1 / -1;
				}

				/*
				 * A checkbox is one line where every other cell is a label above a control, and a
				 * grid cell stretches, so it would otherwise sit against the middle of a row whose
				 * height the input beside it sets. Pinned to the bottom, and carrying that input's
				 * own vertical padding and a transparent border in place of its box, its text
				 * lands on exactly the line the input's text sits on.
				 */
				.supplementary-field {
					align-self: end;
				}

				label:has(input[type="checkbox"]) {
					padding-block: var(--cc-space-2);
					border-block: var(--cc-border-width) solid transparent;
				}
			}

			/*
			 * The supplementary box and, once it is ticked, the holder it asks for share one cell
			 * beside the limit group. Ticked, the box stands where a label would and drops the
			 * input-line padding above, so the holder's select lines up with the group's select.
			 */
			.supplementary-field {
				gap: var(--cc-space-1);
			}

			.supplementary-field:has(select) label:has(input[type="checkbox"]) {
				padding-block: 0;
				border-block-width: 0;
			}

			/*
			 * The id of a saved card cannot be edited, so it has no input -- but it still has to
			 * keep the rhythm of the fields around it. The label half takes the same muted
			 * treatment a real label has, and the value half carries an input's padding and a
			 * transparent border in place of its box, which lands the text on the same line as
			 * the real input beside it.
			 */
			.readonly {
				gap: var(--cc-space-1);
			}

			.readonly__label {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.readonly__value {
				padding: var(--cc-space-2);
				border: var(--cc-border-width) solid transparent;
			}

			fieldset {
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-4);
			}

			.form-actions {
				gap: var(--cc-space-2);
			}
		`,
	];

	@property({ attribute: false }) card: Card | null = null;
	@property({ attribute: false }) groups: LimitGroup[] = [];

	@state() private kind: CycleRule["kind"] = "offset";
	@state() private supplementary = false;
	// Who holds a supplementary card. Kept while the box is unticked, so ticking it straight back
	// does not lose the choice, but only written into the saved card while the box is ticked.
	@state() private owner: Owner | "" = "";
	// Tracked independently of the DOM so a `groups` reshape can be checked against the user's
	// actual choice -- see willUpdate below.
	@state() private selectedGroupId = "";
	// Carries the catalog key, not a resolved sentence: render() resolves it every time, so a
	// language switch while an error is on screen re-renders it in the new language too.
	@state() private errorKey: MessageKey | "" = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override willUpdate(changed: Map<string, unknown>) {
		if (changed.has("card")) {
			if (this.card) this.kind = this.card.cycle.kind;
			this.supplementary = this.card?.supplementary ?? false;
			this.owner = toOwner(this.card?.owner) ?? "";
			this.selectedGroupId = this.card?.limitGroupId ?? "";
			return;
		}
		if (!changed.has("groups")) return;
		// The options come from an unkeyed map, so when `groups` changes shape while the form is
		// open -- a group added or deleted elsewhere on the same /cards page -- Lit patches the
		// existing <option> nodes positionally and the browser keeps its `selectedIndex`, which
		// can silently land the selection on a different group with no `change` event. A
		// create-in-progress has no `this.card` to reset from, so keep the select's own current
		// choice, falling back to the empty placeholder when it no longer names a live group.
		if (!this.groups.some((group) => group.id === this.selectedGroupId)) {
			this.selectedGroupId = "";
		}
	}

	override updated(changed: Map<string, unknown>) {
		// Only when the edit target changes: doing this on every update would fight the user's
		// own selection, which re-renders on any @state change.
		if (changed.has("card")) {
			const select =
				this.renderRoot.querySelector<HTMLSelectElement>('[name="location"]');
			if (select) select.value = this.card?.location ?? DEFAULT_LOCATION;
		}
		// The owner select comes and goes with the supplementary box, so it is freshly created
		// whenever the box is ticked; point it at the tracked choice then, and on a new edit target.
		if (changed.has("card") || changed.has("supplementary")) {
			const owner =
				this.renderRoot.querySelector<HTMLSelectElement>('[name="owner"]');
			if (owner) owner.value = this.owner;
		}
		if (!changed.has("card") && !changed.has("groups")) return;
		const limitGroup = this.renderRoot.querySelector<HTMLSelectElement>(
			'[name="limitGroupId"]',
		);
		// Written from tracked state, not read back from the DOM: by the time this runs, Lit has
		// already patched the <option> nodes for the new `groups`, so the select's own `.value`
		// may already have silently drifted onto the wrong option.
		if (limitGroup) limitGroup.value = this.selectedGroupId;
	}

	private value(name: string): string {
		return (
			this.renderRoot
				.querySelector<HTMLInputElement>(`[name="${name}"]`)
				?.value.trim() ?? ""
		);
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		const id = this.card ? this.card.id : this.value("id");
		const last4 = this.value("last4");
		const closeDay = Number(this.value("closeDay"));

		if (!id) return this.fail("form.error.id");
		if (!this.value("name")) return this.fail("form.error.name");
		if (!/^\d{4}$/.test(last4)) return this.fail("form.error.last4");
		if (!Number.isInteger(closeDay) || closeDay < 1 || closeDay > 31) {
			return this.fail("form.error.closeDay");
		}
		const location = toLocation(this.value("location"));
		if (!location) return this.fail("form.error.location");

		let cycle: CycleRule;
		if (this.kind === "offset") {
			const dueOffsetDays = Number(this.value("dueOffsetDays"));
			if (
				!Number.isInteger(dueOffsetDays) ||
				dueOffsetDays < 1 ||
				dueOffsetDays > 60
			) {
				return this.fail("form.error.dueOffsetDays");
			}
			cycle = { kind: "offset", closeDay, dueOffsetDays };
		} else {
			const dueDay = Number(this.value("dueDay"));
			if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
				return this.fail("form.error.dueDay");
			}
			cycle = { kind: "fixed", closeDay, dueDay };
		}

		const limitGroupId = this.value("limitGroupId");
		if (!limitGroupId) return this.fail("form.error.limitGroup");

		const owner = this.supplementary ? toOwner(this.value("owner")) : null;
		if (this.supplementary && !owner) return this.fail("form.error.owner");

		this.errorKey = "";
		const card: Card = {
			id,
			name: this.value("name"),
			last4,
			location,
			supplementary: this.supplementary,
			// Left off entirely for a primary card: whoever owns its group owns it.
			...(owner ? { owner } : {}),
			cycle,
			comment: this.value("comment"),
			archived: this.card?.archived ?? false,
			limitGroupId,
		};
		// No reset after a create: the page renders this form only inside an open dialog and
		// closes it once the save lands, so the next add gets a fresh form -- and a save the page
		// refuses (a duplicate id, say) leaves the reader's typing in place to fix and retry.
		this.dispatchEvent(new CustomEvent<Card>("save", { detail: card }));
	}

	private fail(key: MessageKey) {
		this.errorKey = key;
	}

	override render() {
		const card = this.card;
		const rule = card?.cycle;
		return html`
				<form @submit=${this.onSubmit}>
				${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}

				${
					card
						? html`
							<div class="readonly" data-field="id">
								<span class="readonly__label">${t("form.id")}</span>
								<span class="readonly__value">${card.id} <small>${t("form.idImmutable")}</small></span>
							</div>
						`
						: html`<label>${t("form.id")} <input name="id" placeholder=${t("form.idPlaceholder")} required /></label>`
				}

				<label>${t("form.name")} <input name="name" .value=${card?.name ?? ""} required /></label>
				<label>${t("form.last4")} <input name="last4" inputmode="numeric" .value=${card?.last4 ?? ""} required /></label>
				<label>
					${t("form.location")}
					<select name="location" required>
						${LOCATIONS.map(
							(value) =>
								html`<option value=${value}>${locationText(value)}</option>`,
						)}
					</select>
				</label>

				<label>
					${t("form.limitGroup")}
					<select name="limitGroupId" required ?disabled=${this.groups.length === 0}
						@change=${(event: Event) => {
							this.selectedGroupId = (event.target as HTMLSelectElement).value;
						}}>
						<option value="">${t("form.limitGroupNone")}</option>
						${[...this.groups]
							.sort(byOwnerThenName)
							.map(
								(group) =>
									html`<option value=${group.id}>${groupLabel(group)}</option>`,
							)}
					</select>
				</label>

				<div class="supplementary-field">
					<label>
						<input type="checkbox" name="supplementary"
							.checked=${this.supplementary}
							@change=${(event: Event) => {
								this.supplementary = (event.target as HTMLInputElement).checked;
							}} />
						${t("form.supplementary")}
					</label>
					${
						this.supplementary
							? html`
								<select name="owner" required aria-label=${t("form.owner")}
									@change=${(event: Event) => {
										this.owner =
											toOwner((event.target as HTMLSelectElement).value) ?? "";
									}}>
									<option value="">${t("form.ownerNone")}</option>
									${OWNERS.map(
										(value) => html`<option value=${value}>${value}</option>`,
									)}
								</select>
							`
							: nothing
					}
				</div>

				<fieldset>
					<legend>${t("form.cycle")}</legend>
					<label>
						<input type="radio" name="kind" value="offset"
							.checked=${this.kind === "offset"}
							@change=${() => {
								this.kind = "offset";
							}} />
						${t("form.cycleOffset")}
					</label>
					<label>
						<input type="radio" name="kind" value="fixed"
							.checked=${this.kind === "fixed"}
							@change=${() => {
								this.kind = "fixed";
							}} />
						${t("form.cycleFixed")}
					</label>
				</fieldset>

				<label>${t("form.closeDay")} <input name="closeDay" type="number" min="1" max="31"
					.value=${String(rule?.closeDay ?? "")} required /></label>

				${
					this.kind === "offset"
						? html`<label>${t("form.dueOffsetDays")} <input name="dueOffsetDays" type="number" min="1" max="60"
							.value=${String(rule?.kind === "offset" ? rule.dueOffsetDays : "")} required /></label>`
						: html`<label>${t("form.dueDay")} <input name="dueDay" type="number" min="1" max="31"
							.value=${String(rule?.kind === "fixed" ? rule.dueDay : "")} required /></label>`
				}

				<label>${t("form.comment")} <input name="comment" .value=${card?.comment ?? ""} /></label>

				<div class="form-actions" row>
					<button type="submit">${card ? t("form.save") : t("form.add")}</button>
					<button type="button" data-variant="quiet" data-action="cancel"
						@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>${t("common.cancel")}</button>
				</div>
				</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-form": CcCardForm;
	}
}
