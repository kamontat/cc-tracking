import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-cards-filter";
import "#components/cc-cards-list";
import "#components/cc-error-banner";
import "#components/cc-group-panels";
import "#components/cc-group-sheet";
import { html, nothing, render } from "lit";
import { cardsSortLabel } from "#components/cc-cards-filter";
import { type FilterPill, filterControls } from "#components/list-controls";
import {
	type CardsRooms,
	type CardsView,
	cardsResults,
	groupPanels,
} from "#lib/domain/cards-view";
import { today } from "#lib/domain/date";
import { LOCATIONS, type Location } from "#lib/domain/location";
import { groupRoom } from "#lib/domain/room";
import type { LimitGroup, LocationRecord } from "#lib/domain/types";
import { locationText } from "#lib/i18n/format";
import { subscribe, t } from "#lib/i18n/index";
import { takeResetNotice } from "#lib/storage/migrate-locations";
import type { Repository } from "#lib/storage/repository";
import {
	groupSheetAddress,
	readCardsView,
	readGroupSheet,
	writeCardsView,
} from "#lib/ui/cards-query";
import { icons } from "#lib/ui/icons";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";
import type { PayAddressBar } from "./pay-page";

/** The address bar as the Cards page uses it, the same seam as `/pay`'s. */
export type CardsAddressBar = PayAddressBar;

const browserBar = (): CardsAddressBar => ({
	search: () => location.search,
	push: (url) => history.pushState(null, "", url),
	replace: (url) => history.replaceState(null, "", url),
	onPop: (listener) => addEventListener("popstate", listener),
	length: () => history.length,
	back: () => history.back(),
});

export type CardsPageOptions = {
	/** Today's date, read once. */
	clock?: () => Date;
	address?: CardsAddressBar;
	/** Where the location-reset notice is read from. */
	storage?: Storage;
};

/** Everything the page draws from, read once per load. */
type CardsData = {
	money: MoneyData;
	rooms: CardsRooms;
	credits: Map<string, number>;
	/** Every place the cards use: the stored order, then any other a card is kept at. */
	order: string[];
	records: LocationRecord[];
};

const isDefaultLocation = (id: string): id is Location =>
	(LOCATIONS as readonly string[]).includes(id);

/**
 * The Cards page (prototype `vCards`): the heading with *Add card*, the shared search, filter
 * and sort, the results, and *Limit groups* beside them from 900px. The view lives in the
 * address (`?q=&loc=&owner=&sort=`), replaced as it changes. A group opens in a sheet at
 * `?group=<id>` (`new` for a blank one): tapping a panel pushes that address so Back closes
 * it; Close steps back over an entry the page pushed, else rewrites the address without the
 * group (DD-102). A save or delete closes the sheet only once written; a failed one keeps it,
 * and what was typed, with the reason.
 */
export function renderCardsPage(
	repo: Repository,
	root: HTMLElement,
	options: CardsPageOptions = {},
): void {
	const now = today((options.clock ?? (() => new Date()))());
	const address = options.address ?? browserBar();
	const storage = options.storage ?? globalThis.localStorage;

	let data: CardsData | null = null;
	let view: CardsView = readCardsView(address.search());
	// The filter sheet is open; it takes a fresh copy of the view, so its draft starts there.
	let filterOpen = false;
	// Read once per page load: the notice is consumed here, not on every paint.
	let resetNames = takeResetNotice(storage);
	let busy = false;
	// A failed save's reason shows in the sheet it failed in, and goes when that sheet closes.
	let sheetFailed = false;
	// Whether this page pushed the entry now showing; see `/pay`.
	let pushed = false;
	let openedOnce = false;
	// A new group's id, made once when its sheet opens, so a retry after a failed save writes
	// the same record rather than a second one.
	let newId: string | null = null;
	/** Makes a new group's id when the address opens the blank sheet, and drops it otherwise. */
	const syncNewId = () => {
		newId =
			readGroupSheet(address.search()) === "new"
				? (newId ?? crypto.randomUUID())
				: null;
	};
	syncNewId();
	const sheetHost = root.ownerDocument.createElement("div");
	sheetHost.id = "group-sheet";

	const state = createPageState({
		fetch: async () => {
			const [money, records] = await Promise.all([
				loadMoneyData(repo, now),
				repo.listLocations(),
			]);
			const rooms: CardsRooms = new Map(
				money.groups.map((group) => [
					group.id,
					groupRoom(group, money.cards, money.ledgers, money.lists, ""),
				]),
			);
			const credits = new Map(
				money.cards.map((c) => [c.id, money.ledgers.get(c.id)?.credit ?? 0]),
			);
			const order: string[] =
				records.length > 0 ? records.map((r) => r.id) : [...LOCATIONS];
			for (const c of money.cards)
				if (!order.includes(c.location)) order.push(c.location);
			data = { money, rooms, credits, order, records };
		},
		fallbackKey: "cards.error.read",
		paint: () => paint(),
	});

	/** A default place by the catalog, so it follows the language; any other by its record. */
	const locationName = (id: string): string => {
		if (isDefaultLocation(id)) return locationText(id);
		return data?.records.find((r) => r.id === id)?.name ?? id;
	};

	const sheetAddress = (group: string | null) =>
		`/cards${groupSheetAddress(writeCardsView(view), group)}`;

	const change = (next: Partial<CardsView>) => {
		view = { ...view, ...next };
		address.replace(sheetAddress(readGroupSheet(address.search())));
		paint();
	};

	const openSheet = (id: string) => {
		// A write under way closes the sheet it began in; opening another now would let that
		// landing save close the wrong one.
		if (busy) return;
		sheetFailed = false;
		pushed = true;
		openedOnce = true;
		address.push(sheetAddress(id));
		syncNewId();
		paint();
	};

	const closeSheet = () => {
		if (busy) return;
		sheetFailed = false;
		// The failed write's reason belongs to the sheet; it goes when the sheet does.
		state.clear();
		if (pushed) {
			pushed = false;
			// The pop that follows repaints without the sheet.
			address.back();
			return;
		}
		address.replace(sheetAddress(null));
		syncNewId();
		paint();
	};

	/** Runs a write for the sheet; closes it once written, else keeps it with the reason. */
	const write = async (
		action: () => Promise<void>,
		key: "cards.error.saveGroup" | "cards.error.deleteGroup",
	) => {
		if (busy) return;
		busy = true;
		sheetFailed = false;
		paint();
		let done = false;
		await state.guard(async () => {
			await action();
			done = true;
		}, key);
		busy = false;
		// Back may have closed the sheet while the write was under way; then there is nothing
		// left to close, and stepping back again would leave the page.
		const open = readGroupSheet(address.search()) !== null;
		if (done) {
			newId = null;
			if (open) closeSheet();
			else paint();
			return;
		}
		sheetFailed = open;
		paint();
	};

	const saveGroup = (group: LimitGroup, isNew: boolean) =>
		write(
			() =>
				repo.saveLimitGroup(isNew && newId ? { ...group, id: newId } : group),
			"cards.error.saveGroup",
		);

	const deleteGroup = (group: LimitGroup) =>
		write(() => repo.deleteLimitGroup(group.id), "cards.error.deleteGroup");

	const chips = (): FilterPill[] => [
		...view.locations.map((location) => ({
			key: `loc:${location}`,
			label: locationName(location),
			clear: () =>
				change({ locations: view.locations.filter((l) => l !== location) }),
		})),
		...view.owners.map((owner) => ({
			key: `owner:${owner}`,
			label: owner,
			clear: () => change({ owners: view.owners.filter((o) => o !== owner) }),
		})),
	];

	const notice = () =>
		resetNames.length > 0
			? html`<article data-testid="location-reset">
				<p>${t("cards.locationReset", { names: resetNames.join(", ") })}</p>
				<button data-variant="quiet" type="button" @click=${() => {
					resetNames = [];
					paint();
				}}>${t("common.dismiss")}</button>
			</article>`
			: nothing;

	const sheet = (d: CardsData) => {
		const sheetId = readGroupSheet(address.search());
		if (sheetId === null) return nothing;
		const { groups, cards } = d.money;
		const group =
			sheetId === "new" ? null : (groups.find((g) => g.id === sheetId) ?? null);
		if (sheetId !== "new" && !group) return nothing;
		return html`<cc-group-sheet
			.group=${group}
			.inUse=${group ? cards.some((c) => c.limitGroupId === group.id) : false}
			.error=${sheetFailed ? state.error : ""}
			.busy=${busy}
			@save-group=${(e: CustomEvent<LimitGroup>) => void saveGroup(e.detail, group === null)}
			@delete-group=${(e: CustomEvent<{ group: LimitGroup }>) => void deleteGroup(e.detail.group)}
			@close=${closeSheet}
		></cc-group-sheet>`;
	};

	const results = (d: CardsData) => {
		const { cards, groups, settings } = d.money;
		const active = chips();
		return html`
			${filterControls({
				q: view.q,
				placeholder: t("cards.searchPlaceholder"),
				onSearch: (q) => change({ q }),
				onOpen: () => {
					filterOpen = true;
					paint();
				},
				count: active.length,
				sort: cardsSortLabel(view.sort),
				chips: active,
			})}
			<cc-cards-list
				.results=${cardsResults(cards, groups, d.rooms, view, d.order)}
				.groups=${groups}
				.rooms=${d.rooms}
				.credits=${d.credits}
				.settings=${settings}
				.locationName=${locationName}
				.total=${cards.length}
			></cc-cards-list>
			${
				filterOpen
					? html`<cc-cards-filter
						.view=${{ ...view }}
						.locations=${LOCATIONS}
						.locationName=${locationName}
						.count=${(v: CardsView) =>
							cardsResults(cards, groups, d.rooms, v, d.order).count}
						@apply=${(e: CustomEvent<CardsView>) => {
							filterOpen = false;
							change({ ...e.detail });
						}}
						@close=${() => {
							filterOpen = false;
							paint();
						}}
					></cc-cards-filter>`
					: nothing
			}
		`;
	};

	const paint = () => {
		const d = data;
		render(
			html`
				<div class="cards-grid">
					<div class="cards-main">
						<div class="cards-head">
							<h1>${t("cards.title")}</h1>
							<a class="cards-add" data-action="add-card" href="/card/new"
								>${icons.plus}${t("cards.page.add")}</a>
						</div>
						${
							sheetFailed || busy
								? nothing
								: html`<cc-error-banner .message=${state.error}
									retry-label=${t("common.reload")}
									@retry=${() => state.load()}></cc-error-banner>`
						}
						${notice()}
						${d ? results(d) : nothing}
					</div>
					${
						d
							? html`<aside class="cards-groups">
								<cc-group-panels
									.panels=${groupPanels(d.money.groups, d.money.cards, d.rooms)}
									@open-group=${(e: CustomEvent<{ id: string }>) => openSheet(e.detail.id)}
									@add-group=${() => openSheet("new")}
								></cc-group-panels>
							</aside>`
							: nothing
					}
				</div>
			`,
			root,
		);
		// The sheet lives outside the page's root, so painting the page never re-creates it.
		if (!sheetHost.isConnected) root.after(sheetHost);
		render(d ? sheet(d) : nothing, sheetHost);
	};

	address.onPop(() => {
		// Read the new entry even while a write is under way, so the write's close knows what
		// is still open and never steps back past this page.
		sheetFailed = false;
		view = readCardsView(address.search());
		// Back off a sheet, or Forward onto one only a tap could have made.
		pushed = openedOnce && readGroupSheet(address.search()) !== null;
		syncNewId();
		if (busy) return;
		paint();
	});
	subscribe(() => paint());
	void state.load();
}

bootstrap("title.cards", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderCardsPage(repo, root);
});
