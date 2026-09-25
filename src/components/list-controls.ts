import { html, nothing, type TemplateResult } from "lit";
import { nextSort, type SortDirection } from "#lib/domain/list-view";
import type { MessageKey } from "#lib/i18n/catalog";
import { t } from "#lib/i18n/index";

/**
 * The search, filter and sort pieces `cc-card-table` and `cc-limit-group-table` share. Plain
 * template functions, not elements: each table renders them into its own shadow root, where
 * `listControls` from `#styles/shared` styles them.
 *
 * Options mark themselves `.selected` rather than a select taking a `.value`: on the first
 * render the select's own binding is committed before its options exist, and would be lost.
 */

type Sortable = { sort: string; dir: SortDirection };

export type Choice = { value: string; text: string };

/** True when every field of `view` matches `defaults` -- nothing to clear. */
export const isDefault = <V extends object>(view: V, defaults: V): boolean =>
	(Object.keys(defaults) as (keyof V)[]).every(
		(key) => view[key] === defaults[key],
	);

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

/**
 * One filter as a pill: its name, then a borderless select whose first option ("Any") means
 * the filter is off. Marked `data-active` while it narrows the list.
 */
export function filterChip(
	name: string,
	label: string,
	value: string,
	choices: Choice[],
	onChange: (value: string) => void,
): TemplateResult {
	return html`
		<label class="chip" ?data-active=${value !== ""}>
			${label}
			<select name=${name} @change=${(event: Event) => onChange(read(event))}>
				<option value="" .selected=${value === ""}>${t("list.any")}</option>
				${choices.map(
					(choice) =>
						html`<option value=${choice.value} .selected=${value === choice.value}>${choice.text}</option>`,
				)}
			</select>
		</label>
	`;
}

const arrow = (dir: SortDirection) => (dir === "asc" ? "▲" : "▼");

/**
 * The sort a stacked table cannot offer through its headers, which it hides. Only shown on
 * the narrow layout; every key comes twice, once each way.
 */
export function sortChip<V extends Sortable>(
	view: V,
	labels: Record<Exclude<V["sort"], "default">, MessageKey>,
	onChange: (view: V) => void,
): TemplateResult {
	const keys = Object.keys(labels) as Exclude<V["sort"], "default">[];
	const current = view.sort === "default" ? "" : `${view.sort}:${view.dir}`;
	return html`
		<label class="chip sort-chip" ?data-active=${current !== ""}>
			${t("list.sort")}
			<select name="sort"
				@change=${(event: Event) => {
					const [sort, dir] = read(event).split(":");
					const key = keys.find((one) => one === sort);
					onChange(
						key && (dir === "asc" || dir === "desc")
							? { ...view, sort: key, dir }
							: { ...view, sort: "default", dir: "asc" },
					);
				}}>
				<option value="" .selected=${current === ""}>${t("list.sortDefault")}</option>
				${keys.flatMap((key) =>
					(["asc", "desc"] as const).map(
						(dir) =>
							html`<option value=${`${key}:${dir}`} .selected=${current === `${key}:${dir}`}>${t(labels[key])} ${arrow(dir)}</option>`,
					),
				)}
			</select>
		</label>
	`;
}

/**
 * A column heading that sorts by `key`. The button carries the click; `aria-sort` on the
 * heading carries the state, and a faint ↕ marks a column that is not the sort.
 */
export function sortHeader<V extends Sortable>(
	label: string,
	key: V["sort"],
	view: V,
	onSort: (view: V) => void,
	numeric = false,
): TemplateResult {
	const active = view.sort === key;
	return html`
		<th ?data-numeric=${numeric}
			aria-sort=${active ? (view.dir === "asc" ? "ascending" : "descending") : "none"}>
			<button type="button" class="sort" data-sort=${key}
				@click=${() => onSort(nextSort(view, key))}>
				${label}<span class="sort-arrow" aria-hidden="true">${active ? arrow(view.dir) : "↕"}</span>
			</button>
		</th>
	`;
}

/** How many rows are showing, and the way back to everything -- only once there is a way back. */
export function listSummary(
	active: boolean,
	count: string,
	onClear: () => void,
): TemplateResult | typeof nothing {
	return active
		? html`
			<span class="toolbar-summary">
				<span data-field="count">${count}</span>
				<button type="button" data-variant="quiet" data-action="clear" @click=${onClear}>${t("list.clear")}</button>
			</span>
		`
		: nothing;
}
