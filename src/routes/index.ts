import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-needs-you";
import "#components/cc-ready-panel";
import { html, render } from "lit";
import { canPurchase } from "#lib/domain/card";
import { today } from "#lib/domain/date";
import { needsYou, type ReadyRow, readyRows } from "#lib/domain/home";
import { unassignedCards } from "#lib/domain/limit";
import { plannedOf } from "#lib/domain/pay";
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
};

/**
 * Renders Home into `root`, wiring it to `repo`: what needs the reader first, then a short
 * *Ready to use* that leads to the new-list picker (DD-103).
 */
export function renderHomePage(
	repo: Repository,
	root: HTMLElement,
	{ clock = () => new Date(), tickMs = 60_000 }: HomeOptions = {},
): void {
	let now = today(clock());
	let data: MoneyData | null = null;

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "home.error.read",
		paint: () => paint(),
	});

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
		render(
			html`
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<cc-needs-you .items=${data ? needsYou(data, now, plannedOf(data.payments)) : []}
					.cards=${data?.cards ?? []} .today=${now}></cc-needs-you>
				<cc-ready-panel
					.rows=${rows}
					.locations=${data?.settings.purchaseLocations ?? []}
					.groups=${data?.groups ?? []}
					.today=${now}
					.unassigned=${unassigned}
				></cc-ready-panel>
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
