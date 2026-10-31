import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-needs-you";
import "#components/cc-ready-list";
import { html, nothing, render } from "lit";
import { canPurchase } from "#lib/domain/card";
import { today } from "#lib/domain/date";
import { needsYou, type ReadyRow, readyRows } from "#lib/domain/home";
import { unassignedCards } from "#lib/domain/limit";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

export type HomeOptions = {
	/** The page's only clock reading: today's date. */
	clock?: () => Date;
	/** How often the page re-reads the clock, so a tab left open past midnight moves on. */
	tickMs?: number;
	/** Opens another page; `location.assign` unless a test records it instead. */
	navigate?: (url: string) => void;
};

/** The purchase lists page, opened on a new list for `cardIds` in the order given. */
export function listAddress(cardIds: string[]): string {
	const query = new URLSearchParams();
	for (const id of cardIds) query.append("card", id);
	return `/list?${query.toString()}`;
}

/**
 * Renders Home into `root`, wiring it to `repo`: what needs the reader first, then the cards
 * ready to use, which the reader ticks to start a purchase list.
 */
export function renderHomePage(
	repo: Repository,
	root: HTMLElement,
	{
		clock = () => new Date(),
		tickMs = 60_000,
		navigate = (url) => location.assign(url),
	}: HomeOptions = {},
): void {
	let now = today(clock());
	let data: MoneyData | null = null;
	// Tap order, which is the order the list page opens its lines in.
	let selected: string[] = [];

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "home.error.read",
		paint: () => paint(),
	});

	const onToggle = (event: CustomEvent<{ cardId: string }>) => {
		const { cardId } = event.detail;
		selected = selected.includes(cardId)
			? selected.filter((id) => id !== cardId)
			: [...selected, cardId];
		paint();
	};

	const clear = () => {
		selected = [];
		paint();
	};

	const selectionBar = () => {
		if (selected.length === 0) return nothing;
		return html`
			<div class="action-bar" data-testid="selection">
				<b>${
					selected.length === 1
						? t("home.selected.one")
						: t("home.selected.many", { count: selected.length })
				}</b>
				<div class="action-bar__actions">
					<button data-variant="quiet" data-action="clear" @click=${clear}>${t("list.clear")}</button>
					<button data-action="enter-amounts" @click=${() => navigate(listAddress(selected))}>${t("home.enterAmounts")} ›</button>
				</div>
			</div>
		`;
	};

	const paint = () => {
		let rows: ReadyRow[] = [];
		let unassigned = 0;
		if (data) {
			rows = readyRows(data, data.settings, now);
			const settings = data.settings;
			unassigned = unassignedCards(data.cards, data.groups).filter((card) =>
				canPurchase(card, settings),
			).length;
		}
		// A card that is no longer ready (archived, moved, its group gone) drops out of the pick.
		const ready = new Set(rows.map((row) => row.card.id));
		if (data) selected = selected.filter((id) => ready.has(id));
		render(
			html`
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<cc-needs-you .items=${data ? needsYou(data, now) : []}></cc-needs-you>
				<cc-ready-list
					.rows=${rows}
					.selected=${selected}
					.locations=${data?.settings.purchaseLocations ?? []}
					.today=${now}
					.unassigned=${unassigned}
					@toggle=${onToggle}
				></cc-ready-list>
				${selectionBar()}
			`,
			root,
		);
	};

	// Re-reads the clock now and then, so a tab left open past midnight moves on to the new day.
	// A new day reloads, since every ledger is worked out against today. Stops once the page is gone.
	const timer = setInterval(() => {
		if (!root.isConnected) {
			clearInterval(timer);
			return;
		}
		const next = today(clock());
		if (next === now) return;
		now = next;
		void state.load();
	}, tickMs);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.home", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderHomePage(repo, root);
});
