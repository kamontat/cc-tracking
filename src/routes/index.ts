import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-due-list";
import "#components/cc-error-banner";
import "#components/cc-purchase-range";
import "#components/cc-quick-add";
import "#components/cc-sitting-list";
import "#components/cc-spendable";
import { html, render } from "lit";
import type { DueRow } from "#components/cc-due-list";
import type { QuickAddDetail } from "#components/cc-quick-add";
import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { displayDate, today } from "#lib/domain/date";
import { spendableRows, unassignedCards } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import { sittingPurchases } from "#lib/domain/purchase-range";
import { DEFAULT_SETTINGS, type Settings } from "#lib/domain/settings";
import { buildStatement, nextActionable } from "#lib/domain/statement";
import type {
	Card,
	LimitGroup,
	Purchase,
	StatementPayment,
} from "#lib/domain/types";
import { getLocale, subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";
import { panelOpen, rememberPanel } from "#lib/ui/panel";
import { purchaseStatus } from "#lib/ui/purchase-dialog";

export type DashboardOptions = {
	/** The page's only clock reading: today's date, entry times, the batch start and "ago". */
	clock?: () => Date;
	/** How often the page re-reads the clock, so a tab left open past midnight moves on. */
	tickMs?: number;
};

/**
 * Renders the dashboard into `root`, wiring it to `repo`: a workspace for entering a pile of
 * receipts, with the purchase form always open, what this sitting has entered beside it, and
 * purchases by date, due statements and spendable room alongside.
 */
export function renderDashboardPage(
	repo: Repository,
	root: HTMLElement,
	{ clock = () => new Date(), tickMs = 60_000 }: DashboardOptions = {},
): void {
	let now = today(clock());
	let cards: Card[] = [];
	let groups: LimitGroup[] = [];
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let settings: Settings = DEFAULT_SETTINGS;
	let batchStart = clock().toISOString();
	// Carries the card and period a purchase landed on, not a resolved sentence: paint()
	// resolves it every time, so a language switch re-renders the confirmation instead of
	// leaving it frozen in whatever language it was written in (or clearing it outright).
	let confirmedPurchase: {
		card: Card;
		period: string;
		over: number;
		groupName: string;
	} | null = null;
	// Bumped once a purchase is stored, which readies the form for the next receipt.
	let cleared = 0;
	// Whether the last write was an add, so its failure shows beside the form the reader is
	// typing in rather than at the top of the page, possibly a screen away.
	let lastWriteWasAdd = false;

	const state = createPageState({
		fetch: async () => {
			cards = await repo.listCards();
			groups = await repo.listLimitGroups();
			settings = await repo.getSettings();
			purchases = (
				await Promise.all(cards.map((card) => repo.listPurchases(card.id)))
			).flat();
			payments = (
				await Promise.all(cards.map((card) => repo.listPayments(card.id)))
			).flat();
			const stored = await repo.getBatchStart();
			// A first visit starts a batch then and there, so the list opens empty rather than
			// counting whatever was entered before it existed.
			if (stored === null) await repo.saveBatchStart(batchStart);
			batchStart = stored ?? batchStart;
		},
		fallbackKey: "dashboard.error.read",
		paint: () => paint(),
	});

	const onMarkPaid = (
		event: CustomEvent<{ cardId: string; period: string }>,
	) => {
		lastWriteWasAdd = false;
		return state.guard(async () => {
			const { cardId, period } = event.detail;
			const card = cards.find((c) => c.id === cardId);
			if (!card) return;
			// Freeze the dates of the statement the event names, not whatever
			// nextActionable happens to recompute right now -- those can disagree.
			const statement = buildStatement(card, period, purchases);
			await repo.savePayment({
				cardId,
				period,
				paidAt: now,
				closeDate: statement.closeDate,
				dueDate: statement.dueDate,
			});
		}, "dashboard.error.markPaid");
	};

	// The form is cleared only once the purchase is stored; a failed save leaves the reader's
	// typing in place, with the reason beside it.
	const onAdd = (event: CustomEvent<QuickAddDetail>) => {
		lastWriteWasAdd = true;
		return state.guard(async () => {
			const { cardId, date, amount, note } = event.detail;
			const card = cards.find((c) => c.id === cardId);
			if (!card) return;
			const row = spendableRows(
				cards,
				groups,
				purchases,
				payments,
				now,
				settings,
			).find((candidate) => candidate.card.id === cardId);
			await repo.savePurchase({
				id: crypto.randomUUID(),
				cardId,
				date,
				amount,
				note,
				addedAt: clock().toISOString(),
			});
			const period = periodOfPurchase(card.cycle, date);
			confirmedPurchase = {
				card,
				period,
				over: row ? Math.max(0, amount - row.available) : 0,
				groupName: row?.group.name ?? "",
			};
			cleared += 1;
		}, "dashboard.error.addPurchase");
	};

	const onStartBatch = () => {
		lastWriteWasAdd = false;
		return state.guard(async () => {
			const at = clock().toISOString();
			await repo.saveBatchStart(at);
			batchStart = at;
		}, "dashboard.error.startBatch");
	};

	/** Cards the page shows. Archived ones are still loaded: they weigh on a shared limit. */
	const visible = (): Card[] => cards.filter((card) => !card.archived);

	const rows = (): DueRow[] =>
		visible().map((card) => ({
			card,
			statement: nextActionable(card, purchases, payments, now),
		}));

	const paint = () => {
		const spendable = spendableRows(
			cards,
			groups,
			purchases,
			payments,
			now,
			settings,
		);
		const over =
			confirmedPurchase && confirmedPurchase.over > 0
				? ` ${t("dashboard.answerOver", {
						over: formatAmount(confirmedPurchase.over),
						name: confirmedPurchase.groupName,
					})}`
				: "";
		const answer = confirmedPurchase
			? `${t("dashboard.answer", {
					close: displayDate(
						closeDateOf(confirmedPurchase.card.cycle, confirmedPurchase.period),
						getLocale(),
					),
					due: displayDate(
						dueDateOf(confirmedPurchase.card.cycle, confirmedPurchase.period),
						getLocale(),
					),
				})}${over}`
			: "";
		const pageError = lastWriteWasAdd ? "" : state.error;
		const formError = lastWriteWasAdd ? state.error : "";
		render(
			html`
				<div class="page-title" row>
					<h1>${t("dashboard.title")}</h1>
				</div>
				<cc-error-banner .message=${pageError} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${purchaseStatus(answer, () => {
					confirmedPurchase = null;
					paint();
				})}
				<div class="split split--workspace">
					<div class="split__column">
						<article>
							<section class="panel" data-panel="add">
								<h2>${t("dashboard.addPurchase")}</h2>
								<cc-error-banner .message=${formError} retry-label=${t("common.reload")}
									@retry=${() => state.load()}></cc-error-banner>
								<cc-quick-add inline
									.cards=${visible().filter((entry) => canPurchase(entry, settings))}
									.rows=${spendable}
									.today=${now}
									.cleared=${cleared}
									@add=${onAdd}></cc-quick-add>
							</section>
						</article>
						<article>
							<section class="panel" data-panel="sitting">
								<h2>${t("sitting.title")}</h2>
								<cc-sitting-list
									.purchases=${sittingPurchases(purchases, batchStart)}
									.cards=${cards}
									.now=${clock().getTime()}
									@start-batch=${onStartBatch}></cc-sitting-list>
							</section>
						</article>
					</div>
					<div class="split__column split__aside">
						<article>
							<details class="panel" data-panel="range" ?open=${panelOpen("range", true)} @toggle=${rememberPanel("range")}>
								<summary><h2>${t("range.title")}</h2></summary>
								<cc-purchase-range .purchases=${purchases} .cards=${cards} .today=${now}></cc-purchase-range>
							</details>
						</article>
						<article>
							<details class="panel" data-panel="due" ?open=${panelOpen("due", false)} @toggle=${rememberPanel("due")}>
								<summary><h2>${t("dashboard.dueNext")}</h2></summary>
								<cc-due-list .rows=${rows()} .today=${now} @mark-paid=${onMarkPaid}></cc-due-list>
							</details>
						</article>
						<article>
							<details class="panel" data-panel="spendable" ?open=${panelOpen("spendable", true)} @toggle=${rememberPanel("spendable")}>
								<summary><h2>${t("spendable.title")}</h2></summary>
								<cc-spendable
									.rows=${spendable}
									.unassigned=${unassignedCards(cards, groups).length}
									.today=${now}
								></cc-spendable>
							</details>
						</article>
					</div>
				</div>
			`,
			root,
		);
	};

	// Re-reads the clock now and then: "how long ago" keeps up, and a tab left open past
	// midnight moves its default date and presets on to the new day. Stops once the page is gone.
	const timer = setInterval(() => {
		if (!root.isConnected) {
			clearInterval(timer);
			return;
		}
		now = today(clock());
		paint();
	}, tickMs);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.dashboard", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderDashboardPage(repo, root);
});
