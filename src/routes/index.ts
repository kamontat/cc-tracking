import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-due-list";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import "#components/cc-spendable";
import { html, nothing, render } from "lit";
import type { DueRow } from "#components/cc-due-list";
import type { QuickAddDetail } from "#components/cc-quick-add";
import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { displayDate, today } from "#lib/domain/date";
import { spendableRows, unassignedCards } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
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
import {
	addPurchaseButton,
	purchaseDialog,
	purchaseStatus,
} from "#lib/ui/purchase-dialog";

/** Renders the dashboard page into `root`, wiring it to `repo`. Exported for tests and for Tasks 11-12 to extend. */
export function renderDashboardPage(repo: Repository, root: HTMLElement): void {
	const now = today();
	let cards: Card[] = [];
	let groups: LimitGroup[] = [];
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let settings: Settings = DEFAULT_SETTINGS;
	// Carries the card and period a purchase landed on, not a resolved sentence: paint()
	// resolves it every time, so a language switch re-renders the confirmation instead of
	// leaving it frozen in whatever language it was written in (or clearing it outright).
	let confirmedPurchase: {
		card: Card;
		period: string;
		over: number;
		groupName: string;
	} | null = null;
	let adding = false;
	// Whether the open dialog has tried a save yet, so an older page error stays out of it.
	let addSubmitted = false;

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
		},
		fallbackKey: "dashboard.error.read",
		paint: () => paint(),
	});

	const onMarkPaid = (event: CustomEvent<{ cardId: string; period: string }>) =>
		state.guard(async () => {
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

	const openAdd = () => {
		adding = true;
		addSubmitted = false;
		paint();
	};

	const closeAdd = () => {
		adding = false;
		paint();
	};

	// Closes the dialog only once the purchase is stored; a failed save leaves it open, with the
	// reason inside it and the reader's typing intact.
	const onAdd = (event: CustomEvent<QuickAddDetail>) => {
		addSubmitted = true;
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
			});
			const period = periodOfPurchase(card.cycle, date);
			confirmedPurchase = {
				card,
				period,
				over: row ? Math.max(0, amount - row.available) : 0,
				groupName: row?.group.name ?? "",
			};
			adding = false;
		}, "dashboard.error.addPurchase");
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
		render(
			html`
				<div class="page-title" row>
					<h1>${t("dashboard.title")}</h1>
					${addPurchaseButton(openAdd)}
				</div>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${purchaseStatus(answer, () => {
					confirmedPurchase = null;
					paint();
				})}
				<article>
					<cc-spendable
						.rows=${spendable}
						.unassigned=${unassignedCards(cards, groups).length}
						.today=${now}
					></cc-spendable>
				</article>
				<article>
					<h2>${t("dashboard.dueNext")}</h2>
					<cc-due-list .rows=${rows()} .today=${now} @mark-paid=${onMarkPaid}></cc-due-list>
				</article>
				${
					adding
						? purchaseDialog({
								cards: visible().filter((entry) =>
									canPurchase(entry, settings),
								),
								rows: spendable,
								today: now,
								error: addSubmitted ? state.error : "",
								onAdd,
								onClose: closeAdd,
								onRetry: () => state.load(),
							})
						: nothing
				}
			`,
			root,
		);
	};

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.dashboard", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderDashboardPage(repo, root);
});
