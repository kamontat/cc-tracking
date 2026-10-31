import { html, nothing, type TemplateResult } from "lit";
import { t } from "#lib/i18n/index";
import "#components/cc-modal";

/**
 * The parts a filter sheet shares (`cc-tx-filter`, `cc-ready-filter`): the choice chips, and the
 * sheet around them with its *Clear all* and *Show N* footer. Plain template functions, drawn
 * inside each element's own shadow root, where `filterSheet` from `#styles/shared` styles them.
 */

/** `values` with `value` added, or taken out when it is there. */
export const toggle = <T>(values: T[], value: T): T[] =>
	values.includes(value)
		? values.filter((v) => v !== value)
		: [...values, value];

/** What a choice chip names, as its one `data-*` attribute: `data-card="A"`, `data-sort="new"`. */
export type ChipKind =
	| "type"
	| "card"
	| "range"
	| "sort"
	| "location"
	| "owner";

/** One choice in a sheet: a quiet pill that reads pressed while chosen. */
export function sheetChip(
	kind: ChipKind,
	value: string,
	label: unknown,
	pressed: boolean,
	onClick: () => void,
): TemplateResult {
	const on = (k: ChipKind) => (kind === k ? value : nothing);
	return html`<button type="button" data-variant="quiet"
		data-type=${on("type")} data-card=${on("card")} data-range=${on("range")}
		data-sort=${on("sort")} data-location=${on("location")} data-owner=${on("owner")}
		aria-pressed=${pressed} @click=${onClick}>${label}</button>`;
}

export type SheetFrame = {
	/** The element drawing the sheet: it re-emits `close`, and emits `apply` with `detail()`. */
	host: HTMLElement;
	/** How many rows the draft would show; none disables the apply button. */
	shown: number;
	/** The apply button's words while `shown` is above zero. */
	showLabel: string;
	onClear: () => void;
	/** The draft to hand back on apply. */
	detail: () => unknown;
};

/**
 * The filter sheet around `body`: Escape, the backdrop and Close re-emit `close` from the host;
 * *Clear all* resets the draft; the apply button lets the sheet slide away first, then emits
 * `apply`, and the page takes the sheet away.
 */
export function filterSheetFrame(
	{ host, shown, showLabel, onClear, detail }: SheetFrame,
	body: TemplateResult,
): TemplateResult {
	return html`<cc-modal sheet heading=${t("tx.filter.title")}
		@close=${(event: Event) => {
			event.stopPropagation();
			host.dispatchEvent(new CustomEvent("close"));
		}}>
		${body}
		<div class="footer">
			<button type="button" data-variant="quiet" data-action="clear"
				@click=${onClear}>${t("tx.filter.clear")}</button>
			<button type="button" data-action="apply" ?disabled=${shown === 0}
				@click=${(event: Event) => {
					const value = detail();
					const sheet = (event.currentTarget as HTMLElement).closest(
						"cc-modal",
					);
					const apply = () =>
						host.dispatchEvent(new CustomEvent("apply", { detail: value }));
					if (sheet) sheet.leave(apply);
					else apply();
				}}>${shown === 0 ? t("tx.filter.nothing") : showLabel}</button>
		</div>
	</cc-modal>`;
}
