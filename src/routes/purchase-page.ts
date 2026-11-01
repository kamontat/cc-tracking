import "#components/cc-error-banner";
import "#components/cc-purchase-picker";
import "#components/cc-purchase-sheet";
import { html, nothing, render } from "lit";
import type { PickDetail } from "#components/cc-pay-picker";
import { today } from "#lib/domain/date";
import { type ReadyRow, readyRows, roomFor } from "#lib/domain/home";
import { LOCATIONS } from "#lib/domain/location";
import type { Purchase } from "#lib/domain/types";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { createPageState } from "#lib/ui/page-state";
import {
	purchaseAddress,
	readPurchaseAddress,
	savedPurchaseAddress,
} from "#lib/ui/purchase-address";
import { banner } from "./list/common";
import { browserBar, type PayAddressBar } from "./pay-page";

export type PurchasePageOptions = {
	/** Today's date, read once. */
	clock?: () => Date;
	/** The clock a new purchase's `addedAt` is read from. */
	now?: () => Date;
	address?: PayAddressBar;
	/** Leaves for the card page after a save; `location.replace`, so Back does not reopen the sheet. */
	navigate?: (url: string) => void;
};

/** Marks `<html data-purchase-page>`, so the shell hides + New: the page is where it leads. */
const markPurchasePage = (root: HTMLElement): void => {
	root.ownerDocument.documentElement.setAttribute("data-purchase-page", "");
};

const byId = (a: ReadyRow, b: ReadyRow): number =>
	a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0;

/** The cards a purchase can go on (FR-22), by the places' order, then id. */
const choices = (
	data: MoneyData,
	order: readonly string[],
	now: string,
): ReadyRow[] => {
	const at = (row: ReadyRow) => {
		const index = order.indexOf(row.card.location);
		return index === -1 ? order.length : index;
	};
	return readyRows(data, data.settings, now).sort(
		(a, b) => at(a) - at(b) || byId(a, b),
	);
};

/**
 * Add purchase without a list. `/purchase` is the card picker -- only cards that can take a
 * purchase, by place then id, with a search -- under a back header; `/purchase?card=<id>` rises
 * the purchase sheet over it: date (today), amount and note, warning about the close date or a
 * date ahead (FR-20). The address and Back follow the payment page (DD-76, DD-102): a pick
 * pushes its address, so Back closes the sheet; closing it steps back over that entry, or
 * rewrites the address when the page was opened at `?card=` directly. A save lands on the card
 * page in place of this one, saying there by how much a purchase went over the room (FR-19); a
 * failed one keeps the sheet and what was typed, with the reason.
 */
export function renderPurchasePage(
	repo: Repository,
	root: HTMLElement,
	options: PurchasePageOptions = {},
): void {
	const now = today((options.clock ?? (() => new Date()))());
	const address = options.address ?? browserBar();
	const navigate = options.navigate ?? ((url: string) => location.replace(url));
	markPurchasePage(root);

	let data: MoneyData | null = null;
	let rows: ReadyRow[] = [];
	let busy = false;
	let saveFailed = false;
	// As on the payment page: whether this page pushed the entry now showing.
	let pushed = false;
	let pickedOnce = false;
	const sheetHost = root.ownerDocument.createElement("div");
	sheetHost.id = "purchase-sheet";

	const state = createPageState({
		fetch: async () => {
			const [loaded, records] = await Promise.all([
				loadMoneyData(repo, now),
				repo.listLocations(),
			]);
			const order: string[] =
				records.length > 0 ? records.map((r) => r.id) : [...LOCATIONS];
			data = loaded;
			rows = choices(loaded, order, now);
		},
		fallbackKey: "purchase.error.read",
		paint: () => paint(),
	});

	const close = () => {
		if (busy) return;
		saveFailed = false;
		if (pushed) {
			pushed = false;
			address.back();
			return;
		}
		address.replace(purchaseAddress());
		paint();
	};

	const save = async (purchase: Purchase) => {
		const loaded = data;
		const card = loaded?.cards.find((c) => c.id === purchase.cardId);
		if (!loaded || !card || busy) return;
		busy = true;
		paint();
		// The room before this purchase: what it goes over by, said on the card page (DR-11).
		const room = roomFor(card, loaded);
		const over = room ? Math.max(0, purchase.amount - room.room) : 0;
		let saved = false;
		await state.guard(async () => {
			await repo.savePurchase(purchase);
			saved = true;
		}, "purchase.error.save");
		if (saved) {
			navigate(savedPurchaseAddress(card.id, over));
			return;
		}
		saveFailed = true;
		busy = false;
		paint();
	};

	const sheet = (loaded: MoneyData, cardId: string) => {
		const card = rows.find((row) => row.card.id === cardId)?.card;
		if (!card) return nothing;
		return html`<cc-purchase-sheet
			.card=${card}
			.groups=${loaded.groups}
			.purchase=${null}
			.today=${now}
			.now=${options.now ?? (() => new Date())}
			.error=${saveFailed ? state.error : ""}
			.busy=${busy}
			@save-purchase=${(event: CustomEvent<Purchase>) => void save(event.detail)}
			@close=${close}
		></cc-purchase-sheet>`;
	};

	const paint = () => {
		const cardId = readPurchaseAddress(address.search());
		const header = backHeader({
			title: t("purchase.title"),
			back: () =>
				address.length() > 1 ? address.back() : navigate("/transactions"),
		});
		if (!data) {
			render(html`${header}${banner(state)}`, root);
			render(nothing, sheetHost);
			return;
		}
		// Only a card the picker offers opens a sheet: an archived or ungrouped one can't take it.
		const known = cardId ? rows.some((row) => row.card.id === cardId) : false;
		render(
			html`${header}${saveFailed ? nothing : banner(state)}
				${
					cardId && !known
						? html`<p class="placeholder" data-missing>${t("purchase.missing")}</p>`
						: nothing
				}
				<cc-purchase-picker
					.rows=${rows}
					.groups=${data.groups}
					.today=${now}
					@pick=${(event: CustomEvent<PickDetail>) => {
						saveFailed = false;
						pushed = true;
						pickedOnce = true;
						address.push(purchaseAddress(event.detail.cardId));
						paint();
					}}
				></cc-purchase-picker>`,
			root,
		);
		if (!sheetHost.isConnected) root.after(sheetHost);
		render(known && cardId ? sheet(data, cardId) : nothing, sheetHost);
	};

	address.onPop(() => {
		if (busy) return;
		saveFailed = false;
		pushed = pickedOnce && readPurchaseAddress(address.search()) !== undefined;
		paint();
	});
	subscribe(() => paint());
	void state.load();
}
