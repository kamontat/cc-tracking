import "#components/cc-error-banner";
import {
	css,
	html,
	LitElement,
	nothing,
	type PropertyValues,
	type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { byOwnerThenName } from "#lib/domain/list-view";
import { DEFAULT_LOCATION } from "#lib/domain/location";
import { formatAmount } from "#lib/domain/money";
import {
	DEFAULT_OWNER,
	groupLabel,
	OWNERS,
	type Owner,
	ownerOf,
	toOwner,
} from "#lib/domain/owner";
import type {
	Card,
	CycleRule,
	LimitGroup,
	LocationRecord,
} from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { LocaleController } from "#lib/i18n/controller";
import { locationName, sortLocations } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, controls, panel } from "#styles/shared";

type Kind = CycleRule["kind"];

const TEXT_FIELDS = [
	"id",
	"name",
	"last4",
	"closeDay",
	"dueOffsetDays",
	"dueDay",
	"comment",
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

const blank = (): Record<TextField, string> =>
	Object.fromEntries(TEXT_FIELDS.map((field) => [field, ""])) as Record<
		TextField,
		string
	>;

const numberOf = (text: string): number => {
	const trimmed = text.trim();
	return trimmed === "" ? Number.NaN : Number(trimmed);
};

/**
 * The card form, the whole of `/card/new` and `/card/edit` under their sub-header, in panels:
 * *Card* (name; card id, disabled when editing, beside last 4), *Where and who* (*Kept in* as a
 * segmented control of every stored location, A to Z by shown name; the limit group,
 * `name (holder) · limit`; the cardholder, the group's account holder or a supplementary card
 * with its own holder), *Billing cycle* (the kind, then the close day beside *due days after
 * close* or *due on day*) and *Comment*; then the submit. Archive and Delete live on the card page's More menu, not here.
 *
 * Emits `save` with the card. `error` is the page's reason a write failed; what was typed stays,
 * since the fields fill from `card` only when it turns to another card (UI-11).
 */
@customElement("cc-card-form")
export class CcCardForm extends LitElement {
	static override styles = [
		base,
		controls,
		panel,
		css`
			form {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
			}

			/* A section's name: small and muted over its panel, like the prototype's labels. */
			h2 {
				font-size: var(--cc-text-xs);
				font-weight: 650;
				color: var(--cc-text-muted);
				text-transform: uppercase;
				letter-spacing: var(--cc-tracking-caps);
			}

			.pair {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: var(--cc-space-3);
				align-items: start;
			}

			/* The cardholder, with a supplementary card's own holder under it. */
			.field {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			fieldset {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
				min-inline-size: 0;
				padding: 0;
				margin: 0;
				border: 0;
			}

			legend {
				padding: 0;
				margin-bottom: var(--cc-space-1);
				font-size: var(--cc-text-sm);
				font-weight: inherit;
				color: var(--cc-text-muted);
				text-transform: none;
				letter-spacing: normal;
			}

			small {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			input,
			select {
				min-inline-size: 0;
				padding: var(--cc-space-3);
				border-radius: var(--cc-radius-sm);
			}

			select {
				padding-right: calc(var(--cc-space-3) * 2 + var(--cc-select-chevron-size));
			}

			input:disabled {
				color: var(--cc-text-muted);
				background: var(--cc-surface-sunken);
			}

			.seg {
				display: grid;
				grid-auto-columns: minmax(0, 1fr);
				grid-auto-flow: column;
				gap: var(--cc-space-1);
				padding: var(--cc-space-1);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}

			.seg button {
				align-self: stretch;
				white-space: normal;
				color: var(--cc-text);
				background: transparent;
				border-color: transparent;
			}

			.seg button[aria-pressed="true"] {
				font-weight: 650;
				color: var(--cc-success);
				background: var(--cc-surface);
				border-color: var(--cc-border);
			}

			section {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
			}

			.actions {
				display: flex;
				flex-direction: column;
			}

			.actions > button {
				align-self: stretch;
				padding: var(--cc-space-3) var(--cc-space-4);
				font-size: var(--cc-text-md);
				font-weight: 650;
			}
		`,
	];

	/** The card to edit; null for a new one. */
	@property({ attribute: false }) card: Card | null = null;
	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** The stored locations, every one offered under *Kept in*. */
	@property({ attribute: false }) locations: LocationRecord[] = [];
	/** Why the page's last write failed; typing is kept. */
	@property() error = "";
	/** A write is under way: the buttons wait. */
	@property({ type: Boolean }) busy = false;

	// The typed text fields, by input name.
	@state() private text: Record<TextField, string> = blank();
	// The place picked, or the card's own; "" for a new card until one is picked (`keptIn`).
	@state() private location = "";
	@state() private groupId = "";
	@state() private kind: Kind = "offset";
	@state() private supplementary = false;
	// Kept while the card is set back to the account holder, so switching straight back does not
	// lose the choice; written into the saved card only for a supplementary one.
	@state() private owner: Owner | "" = "";
	// The catalog key, so a language switch re-renders the message in place.
	@state() private errorKey: MessageKey | "" = "";
	/** The id the fields were last filled from (`null` for a new card); unset before the first fill. */
	private filledFor: string | null | undefined = undefined;

	constructor() {
		super();
		new LocaleController(this);
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("card")) this.fill();
		// A group deleted elsewhere while the form is open falls back to the placeholder rather
		// than silently landing on whichever group now sits in its old place.
		if (
			changed.has("groups") &&
			this.groupId &&
			!this.groups.some((group) => group.id === this.groupId)
		) {
			this.groupId = "";
		}
	}

	/** Fills the fields from `card` only when it turns to another card (by id). */
	private fill() {
		const card = this.card;
		const id = card?.id ?? null;
		if (id === this.filledFor) return;
		this.filledFor = id;
		const rule = card?.cycle;
		this.text = {
			id: card?.id ?? "",
			name: card?.name ?? "",
			last4: card?.last4 ?? "",
			closeDay: rule ? String(rule.closeDay) : "",
			dueOffsetDays: rule?.kind === "offset" ? String(rule.dueOffsetDays) : "",
			dueDay: rule?.kind === "fixed" ? String(rule.dueDay) : "",
			comment: card?.comment ?? "",
		};
		this.location = card?.location ?? "";
		this.groupId = card?.limitGroupId ?? "";
		// A group deleted since the card was saved: the same fallback as the groups change below.
		// With no groups loaded yet the id stays, for when they arrive.
		if (
			this.groupId &&
			this.groups.length > 0 &&
			!this.groups.some((group) => group.id === this.groupId)
		)
			this.groupId = "";
		this.kind = rule?.kind ?? "offset";
		this.supplementary = card?.supplementary ?? false;
		this.owner = toOwner(card?.owner) ?? "";
		this.errorKey = "";
	}

	protected override updated() {
		// The selects are written from tracked state after every render: their options come
		// from unkeyed maps, so the browser's own selection can drift when the list reshapes.
		const select = (name: string, value: string) => {
			const el = this.renderRoot.querySelector<HTMLSelectElement>(
				`select[name="${name}"]`,
			);
			if (el && el.value !== value) el.value = value;
		};
		select("limitGroupId", this.groupId);
		select("holder", this.supplementary ? "supplementary" : "account");
		select("owner", this.owner);
	}

	private fail(key: MessageKey) {
		this.errorKey = key;
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		if (this.busy) return;
		const text = this.text;
		const id = this.card ? this.card.id : text.id.trim();
		const name = text.name.trim();
		const last4 = text.last4.trim();
		const closeDay = numberOf(text.closeDay);

		if (!id) return this.fail("form.error.id");
		if (!name) return this.fail("form.error.name");
		if (!/^\d{4}$/.test(last4)) return this.fail("form.error.last4");
		if (!Number.isInteger(closeDay) || closeDay < 1 || closeDay > 31) {
			return this.fail("form.error.closeDay");
		}

		let cycle: CycleRule;
		if (this.kind === "offset") {
			const dueOffsetDays = numberOf(text.dueOffsetDays);
			if (
				!Number.isInteger(dueOffsetDays) ||
				dueOffsetDays < 1 ||
				dueOffsetDays > 60
			) {
				return this.fail("form.error.dueOffsetDays");
			}
			cycle = { kind: "offset", closeDay, dueOffsetDays };
		} else {
			const dueDay = numberOf(text.dueDay);
			if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
				return this.fail("form.error.dueDay");
			}
			cycle = { kind: "fixed", closeDay, dueDay };
		}

		if (!this.groups.some((group) => group.id === this.groupId)) {
			return this.fail("form.error.limitGroup");
		}
		const owner = this.supplementary ? toOwner(this.owner) : null;
		if (this.supplementary && !owner) return this.fail("form.error.owner");

		this.errorKey = "";
		const card: Card = {
			id,
			name,
			last4,
			location: this.keptIn(),
			supplementary: this.supplementary,
			// Left off for a primary card: whoever holds its group holds it.
			...(owner ? { owner } : {}),
			cycle,
			comment: text.comment.trim(),
			archived: this.card?.archived ?? false,
			limitGroupId: this.groupId,
		};
		this.dispatchEvent(new CustomEvent<Card>("save", { detail: card }));
	}

	/** An input bound to one of the tracked fields. */
	private input(
		name: TextField,
		extra: {
			numeric?: boolean;
			min?: number;
			max?: number;
			placeholder?: string;
			/** The id of the heading that names it, when no label wraps it. */
			labelledBy?: string;
		} = {},
	) {
		const ranged = extra.min !== undefined;
		return html`<input name=${name} .value=${this.text[name]}
			inputmode=${extra.numeric ? "numeric" : nothing}
			type=${ranged ? "number" : "text"}
			min=${extra.min ?? nothing} max=${extra.max ?? nothing}
			placeholder=${extra.placeholder ?? nothing}
			aria-labelledby=${extra.labelledBy ?? nothing}
			autocomplete="off"
			@input=${(event: Event) => {
				this.text = {
					...this.text,
					[name]: (event.target as HTMLInputElement).value,
				};
			}} />`;
	}

	/** A segmented control: one `aria-pressed` button per value. */
	private seg<T>(
		values: readonly T[],
		pressedOf: (value: T) => boolean,
		button: (value: T, pressed: string) => unknown,
	) {
		return html`<div class="seg">${values.map((value) =>
			button(value, pressedOf(value) ? "true" : "false"),
		)}</div>`;
	}

	/**
	 * Where the card is kept: the place picked or stored, else for a new card Bangkok while it is
	 * stored (or nothing is loaded yet), else the first location A to Z.
	 */
	private keptIn(): string {
		if (this.location) return this.location;
		if (
			this.locations.length === 0 ||
			this.locations.some((record) => record.id === DEFAULT_LOCATION)
		)
			return DEFAULT_LOCATION;
		return sortLocations(this.locations)[0]?.id ?? DEFAULT_LOCATION;
	}

	private holderOf(): Owner {
		const group = this.groups.find(({ id }) => id === this.groupId);
		return group ? ownerOf(group) : DEFAULT_OWNER;
	}

	override render() {
		const card = this.card;
		const groups = [...this.groups].sort(byOwnerThenName);
		const select = (setter: (value: string) => void) => (event: Event) =>
			setter((event.target as HTMLSelectElement).value);
		/** A panel named by its heading. */
		const section = (id: string, key: MessageKey, body: TemplateResult) =>
			html`<section aria-labelledby=${`section-${id}`}>
				<h2 id=${`section-${id}`}>${t(key)}</h2>
				<article>${body}</article>
			</section>`;
		return html`<form @submit=${this.onSubmit} novalidate>
			<cc-error-banner .message=${this.error} no-retry></cc-error-banner>
			${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}

			${section(
				"card",
				"form.section.card",
				html`<label>${t("form.name")} ${this.input("name")}</label>
					<div class="pair">
						<label>${t("form.id")}
							${
								card
									? html`<input name="id" .value=${card.id} disabled />`
									: this.input("id", { placeholder: t("form.idPlaceholder") })
							}
						</label>
						<label>${t("form.last4")} ${this.input("last4", { numeric: true })}</label>
					</div>`,
			)}

			${section(
				"where",
				"form.section.where",
				html`<fieldset>
						<legend>${t("form.location")}</legend>
						${this.seg(
							sortLocations(this.locations),
							(record) => record.id === this.keptIn(),
							(
								record,
								pressed,
							) => html`<button type="button" data-location=${record.id}
								aria-pressed=${pressed} @click=${() => {
									this.location = record.id;
								}}>${locationName(record)}</button>`,
						)}
					</fieldset>

					<label>${t("form.limitGroup")}
						<select name="limitGroupId" ?disabled=${groups.length === 0}
							@input=${select((value) => {
								this.groupId = value;
							})}
							@change=${select((value) => {
								this.groupId = value;
							})}>
							<option value="">${t("form.limitGroupNone")}</option>
							${groups.map(
								(group) =>
									html`<option value=${group.id}>${groupLabel(group)} · ${formatAmount(group.limit)}</option>`,
							)}
						</select>
					</label>

					<div class="field">
						<label>${t("form.holder")}
							<select name="holder"
								@input=${select((value) => {
									this.supplementary = value === "supplementary";
								})}
								@change=${select((value) => {
									this.supplementary = value === "supplementary";
								})}>
								<option value="account">${t("form.holderAccount", { owner: this.holderOf() })}</option>
								<option value="supplementary">${t("form.supplementary")}</option>
							</select>
						</label>
						${
							this.supplementary
								? html`<label>${t("form.owner")}
									<select name="owner"
										@input=${select((value) => {
											this.owner = toOwner(value) ?? "";
										})}
										@change=${select((value) => {
											this.owner = toOwner(value) ?? "";
										})}>
										<option value="">${t("form.ownerNone")}</option>
										${OWNERS.map((value) => html`<option value=${value}>${value}</option>`)}
									</select>
								</label>`
								: nothing
						}
					</div>`,
			)}

			${section(
				"cycle",
				"form.cycle",
				html`<div role="group" aria-labelledby="section-cycle">
						${this.seg(
							["offset", "fixed"] as const,
							(kind) => kind === this.kind,
							(kind, pressed) => html`<button type="button" data-kind=${kind}
								aria-pressed=${pressed} @click=${() => {
									this.kind = kind;
								}}>${t(kind === "offset" ? "form.cycleOffset" : "form.cycleFixed")}</button>`,
						)}
					</div>
					<div class="pair">
						<label>${t("form.closeDay")} ${this.input("closeDay", { numeric: true, min: 1, max: 31 })}</label>
						${
							this.kind === "offset"
								? html`<label>${t("form.dueOffsetDays")} ${this.input("dueOffsetDays", { numeric: true, min: 1, max: 60 })}</label>`
								: html`<label>${t("form.dueDay")} ${this.input("dueDay", { numeric: true, min: 1, max: 31 })}</label>`
						}
					</div>`,
			)}

			${section(
				"comment",
				"form.comment",
				this.input("comment", { labelledBy: "section-comment" }),
			)}

			<div class="actions">
				<button type="submit" ?disabled=${this.busy}>${card ? t("form.save") : t("form.add")}</button>
			</div>
		</form>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-form": CcCardForm;
	}
}
