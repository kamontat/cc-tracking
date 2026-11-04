import { html, nothing, type TemplateResult } from "lit";
import { t } from "#lib/i18n/index";
import { icons } from "#lib/ui/icons";

/** The search box and the filter controls Transactions, Cards and the new-list picker share. */

const read = (event: Event) =>
	(event.target as HTMLInputElement | HTMLSelectElement).value;

export function searchBox(
	value: string,
	placeholder: string,
	onInput: (value: string) => void,
): TemplateResult {
	return html`<input class="search" type="search" name="q" .value=${value}
		aria-label=${t("list.search")} placeholder=${placeholder}
		@input=${(event: Event) => onInput(read(event))} />`;
}

/** One removable filter chip: `label` is read out by its remove label; `shown` is drawn instead. */
export type FilterPill = {
	key: string;
	label: string;
	shown?: TemplateResult;
	clear: () => void;
};

/**
 * The search box, the Filter button (its badge counts the filters in use), the sort chip and a
 * removable chip per filter, as Transactions and the new-list picker draw them (`.tx-controls`
 * in `app.css`). The Filter button and the sort chip both open the filter sheet.
 */
export function filterControls(options: {
	q: string;
	placeholder: string;
	onSearch: (q: string) => void;
	onOpen: () => void;
	/** How many filters are in use, for the Filter button's badge. */
	count: number;
	/** The sort's own words, for the sort chip. */
	sort: string;
	chips: FilterPill[];
	/** An extra class beside `tx-controls`. */
	className?: string;
}): TemplateResult {
	const { q, placeholder, onSearch, onOpen, count, sort, chips } = options;
	return html`<div class=${options.className ? `tx-controls ${options.className}` : "tx-controls"}>
		<div class="tx-ctl">
			<label class="tx-search">${icons.search}${searchBox(q, placeholder, onSearch)}</label>
			<button type="button" class="tx-fbtn" data-variant="quiet" data-action="filter"
				@click=${onOpen}>${icons.filter}${t("tx.filter.open")}${
					count ? html`<b class="tx-count">${count}</b>` : nothing
				}</button>
		</div>
		<div class="tx-chips">
			<button type="button" class="tx-chip tx-sort" data-variant="quiet" data-action="sort"
				@click=${onOpen}>${t("tx.sortChip", { sort })} ▾</button>
			${chips.map(
				(chip) =>
					html`<button type="button" class="tx-chip" data-variant="quiet" data-chip=${chip.key}
						aria-label=${t("tx.chip.remove", { filter: chip.label })}
						@click=${chip.clear}>${chip.shown ?? chip.label} ×</button>`,
			)}
		</div>
	</div>`;
}
