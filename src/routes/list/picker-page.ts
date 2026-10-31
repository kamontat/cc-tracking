import "#components/cc-ready-filter";
import "#components/cc-ready-picker";
import { html, nothing, render } from "lit";
import { searchBox } from "#components/list-controls";
import { canPurchase } from "#lib/domain/card";
import { today } from "#lib/domain/date";
import type { ReadySort } from "#lib/domain/home";
import { type ReadyRow, readyRows, sortReady } from "#lib/domain/home";
import { unassignedCards } from "#lib/domain/limit";
import {
	filterReady,
	type ReadyFilter,
	readyFilterCount,
	readyLocations,
	readyOwners,
} from "#lib/domain/ready-filter";
import { locationText } from "#lib/i18n/format";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { icons } from "#lib/ui/icons";
import { newListAddress } from "#lib/ui/list-address";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { createPageState } from "#lib/ui/page-state";
import {
	type ReadyView,
	readReadyView,
	readyViewAddress,
} from "#lib/ui/ready-query";
import { banner, markListPage } from "./common";

export type PickerPageOptions = {
	/** The page's only clock reading: today's date. */
	clock?: () => Date;
	/** The address's query; `location.search` unless a test passes its own. */
	search?: string;
	/** Rewrites the address without a history entry; `history.replaceState` by default. */
	replaceAddress?: (url: string) => void;
	/** Opens the entering step; `location.assign`, so Back returns to the picker. */
	navigate?: (url: string) => void;
};

/**
 * The new-list picker, `/list/new` with no `card` (DD-103): *Ready to use* in full under a back
 * header, with a search box, a Filter button (its badge counts the filters in use), the sort
 * chip and a removable chip per filter; the filter sheet offers *Kept in*, *Account holder*
 * and *Sort*. Each card is a row with a tick; once any is ticked the selection bar offers
 * *Clear* and *Enter amounts*, which opens `/list/new?card=…` in tap order. The search, filters
 * and sort live in the address (`replaceState`); the selection lives in memory.
 */
export function renderPickerPage(
	repo: Repository,
	root: HTMLElement,
	options: PickerPageOptions = {},
): void {
	const now = today((options.clock ?? (() => new Date()))());
	const replaceAddress =
		options.replaceAddress ??
		((url: string) => history.replaceState(history.state, "", url));
	const navigate = options.navigate ?? ((url: string) => location.assign(url));
	markListPage(root);

	let view: ReadyView = readReadyView(options.search ?? location.search);
	let data: MoneyData | null = null;
	// Tap order, which is the order the entering step opens its lines in.
	let selected: string[] = [];
	// A fresh object each time the sheet opens, so the sheet's draft starts from the view.
	let sheet: ReadyFilter | null = null;

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "home.error.read",
		paint: () => paint(),
	});

	const change = (next: Partial<ReadyView>) => {
		view = { ...view, ...next };
		replaceAddress(readyViewAddress(view));
		paint();
	};
	const setFilter = (patch: Partial<ReadyFilter>) =>
		change({ filter: { ...view.filter, ...patch } });

	const toggle = (cardId: string) => {
		selected = selected.includes(cardId)
			? selected.filter((id) => id !== cardId)
			: [...selected, cardId];
		paint();
	};

	type Chip = { key: string; label: string; clear: () => void };
	const chips = (): Chip[] => {
		const { filter } = view;
		return [
			...filter.locations.map((location) => ({
				key: `location:${location}`,
				label: locationText(location),
				clear: () =>
					setFilter({
						locations: filter.locations.filter((l) => l !== location),
					}),
			})),
			...filter.owners.map((owner) => ({
				key: `owner:${owner}`,
				label: owner,
				clear: () =>
					setFilter({ owners: filter.owners.filter((o) => o !== owner) }),
			})),
		];
	};

	const controls = () => {
		const openSheet = () => {
			sheet = { ...view.filter };
			paint();
		};
		const count = readyFilterCount(view.filter);
		return html`<div class="tx-controls ready-controls">
			<div class="tx-ctl">
				<label class="tx-search">${icons.search}${searchBox(
					view.filter.q,
					t("ready.search"),
					(q) => setFilter({ q }),
				)}</label>
				<button type="button" class="tx-fbtn" data-variant="quiet" data-action="filter"
					@click=${openSheet}>${icons.filter}${t("tx.filter.open")}${
						count ? html`<b class="tx-count">${count}</b>` : nothing
					}</button>
			</div>
			<div class="tx-chips">
				<button type="button" class="tx-chip tx-sort" data-variant="quiet" data-action="sort"
					@click=${openSheet}>${t("tx.sortChip", { sort: t(`ready.sort.${view.sort}`) })} ▾</button>
				${chips().map(
					(chip) =>
						html`<button type="button" class="tx-chip" data-variant="quiet" data-chip=${chip.key}
							aria-label=${t("tx.chip.remove", { filter: chip.label })}
							@click=${chip.clear}>${chip.label} ×</button>`,
				)}
			</div>
		</div>`;
	};

	const selectionBar = () => {
		if (selected.length === 0) return nothing;
		return html`
			<div class="action-bar" data-testid="selection">
				<b>${
					selected.length === 1
						? t("ready.selected.one")
						: t("ready.selected.many", { count: selected.length })
				}</b>
				<div class="action-bar__actions">
					<button data-variant="quiet" data-action="clear" @click=${() => {
						selected = [];
						paint();
					}}>${t("list.clear")}</button>
					<button data-action="enter-amounts" @click=${() => navigate(newListAddress(selected))}>${t("ready.enterAmounts")} ›</button>
				</div>
			</div>
		`;
	};

	const notice = (from: MoneyData) => {
		const settings = from.settings;
		const unassigned = unassignedCards(from.cards, from.groups).filter((card) =>
			canPurchase(card, settings),
		).length;
		if (unassigned === 0) return nothing;
		return html`<p class="note" data-testid="unassigned">
			${t(
				unassigned === 1
					? "spendable.unassigned.one"
					: "spendable.unassigned.many",
				{ count: unassigned },
			)}
			<a href="/cards">${t("spendable.unassignedAction")}</a>
		</p>`;
	};

	const body = (from: MoneyData, all: ReadyRow[]) => {
		if (all.length === 0) {
			return html`<div class="ready-empty" data-empty="none">
				<p>${t("ready.empty")}</p>
				<p>${t("quickAdd.noEligible")}</p>
				<a data-action="settings" href="/settings">${t("ready.toSettings")}</a>
			</div>`;
		}
		const shown = sortReady(filterReady(all, view.filter), view.sort);
		return html`${controls()}
			${
				shown.length === 0
					? html`<p class="placeholder" data-empty="no-match">${t("ready.noMatch")}
						<button type="button" data-variant="quiet" data-action="clear-filters"
							@click=${() => change({ filter: { q: "", locations: [], owners: [] } })}>${t("tx.filter.clear")}</button></p>`
					: html`<cc-ready-picker
						.rows=${shown}
						.selected=${selected}
						.groups=${from.groups}
						.today=${now}
						@toggle=${(e: CustomEvent<{ cardId: string }>) => toggle(e.detail.cardId)}
					></cc-ready-picker>`
			}
			${
				sheet
					? html`<cc-ready-filter
						.locations=${readyLocations(all)}
						.owners=${readyOwners(all)}
						.filter=${sheet}
						.sort=${view.sort}
						.count=${(f: ReadyFilter) => filterReady(all, f).length}
						@apply=${(
							e: CustomEvent<{ filter: ReadyFilter; sort: ReadySort }>,
						) => {
							sheet = null;
							change({ filter: e.detail.filter, sort: e.detail.sort });
						}}
						@close=${() => {
							sheet = null;
							paint();
						}}
					></cc-ready-filter>`
					: nothing
			}`;
	};

	const paint = () => {
		const all = data ? readyRows(data, data.settings, now) : [];
		// A card that is no longer ready (archived, moved, its group gone) drops out of the pick.
		if (data) {
			const ready = new Set(all.map((row) => row.card.id));
			selected = selected.filter((id) => ready.has(id));
		}
		const places = (data?.settings.purchaseLocations ?? [])
			.map(locationText)
			.join(", ");
		render(
			html`${backHeader({
				title: t("purchaseList.new"),
				...(data && all.length > 0
					? {
							detail: t(
								all.length === 1 ? "ready.summary.one" : "ready.summary.many",
								{ count: all.length, places },
							),
						}
					: {}),
				back: "/",
			})}
			${banner(state)}
			${data ? body(data, all) : nothing}
			${data ? notice(data) : nothing}
			${selectionBar()}`,
			root,
		);
	};

	subscribe(() => paint());
	void state.load();
}
