import "@picocss/pico/css/pico.min.css";
import "#components/cc-due-list.ts";
import "#components/cc-error-banner.ts";
import "#components/cc-location-groups.ts";
import "#components/cc-quick-add.ts";
import { html, render } from "lit";
import type { DueRow } from "#components/cc-due-list.ts";
import type { QuickAddDetail } from "#components/cc-quick-add.ts";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle.ts";
import { displayDate, today } from "#lib/domain/date.ts";
import { nextActionable } from "#lib/domain/statement.ts";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";
import { bootstrap } from "#lib/ui/page.ts";
import { createPageState } from "#lib/ui/page-state.ts";

/** Renders the dashboard page into `root`, wiring it to `repo`. Exported for tests and for Tasks 11-12 to extend. */
export function renderDashboardPage(repo: Repository, root: HTMLElement): void {
	const now = today();
	let cards: Card[] = [];
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let answer = "";

	const state = createPageState({
		fetch: async () => {
			cards = (await repo.listCards()).filter((card) => !card.archived);
			purchases = (
				await Promise.all(cards.map((card) => repo.listPurchases(card.id)))
			).flat();
			payments = (
				await Promise.all(cards.map((card) => repo.listPayments(card.id)))
			).flat();
		},
		fallbackMessage: "Could not read your cards.",
		paint: () => paint(),
	});

	const onMarkPaid = (event: CustomEvent<{ cardId: string; period: string }>) =>
		state.guard(async () => {
			const { cardId, period } = event.detail;
			const card = cards.find((c) => c.id === cardId);
			if (!card) return;
			const statement = nextActionable(card, purchases, payments, now);
			await repo.savePayment({
				cardId,
				period,
				paidAt: now,
				closeDate: statement.closeDate,
				dueDate: statement.dueDate,
			});
		}, "Could not record the payment.");

	const onAdd = (event: CustomEvent<QuickAddDetail>) =>
		state.guard(async () => {
			const { cardId, date, amount, note } = event.detail;
			const card = cards.find((c) => c.id === cardId);
			if (!card) return;
			await repo.savePurchase({
				id: crypto.randomUUID(),
				cardId,
				date,
				amount,
				note,
			});
			const period = periodOfPurchase(card.cycle, date);
			answer =
				`Lands on the statement closing ${displayDate(closeDateOf(card.cycle, period))}` +
				` — pay by ${displayDate(dueDateOf(card.cycle, period))}.`;
		}, "Could not save the purchase.");

	const rows = (): DueRow[] =>
		cards.map((card) => ({
			card,
			statement: nextActionable(card, purchases, payments, now),
		}));

	const paint = () =>
		render(
			html`
				<h1>Dashboard</h1>
				<cc-error-banner .message=${state.error} retry-label="Reload" @retry=${() => state.load()}></cc-error-banner>
				<article>
					<h2>Due next</h2>
					<cc-due-list .rows=${rows()} .today=${now} @mark-paid=${onMarkPaid}></cc-due-list>
				</article>
				<article>
					<h2>Add a purchase</h2>
					<cc-quick-add .cards=${cards} .today=${now} .answer=${answer} @add=${onAdd}></cc-quick-add>
				</article>
				<article>
					<cc-location-groups .rows=${rows()}></cc-location-groups>
				</article>
			`,
			root,
		);

	void state.load();
}

bootstrap((repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderDashboardPage(repo, root);
});
