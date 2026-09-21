import "@picocss/pico/css/pico.min.css";
import "#components/cc-due-list.ts";
import "#components/cc-error-banner.ts";
import { html, render } from "lit";
import type { DueRow } from "#components/cc-due-list.ts";
import { today } from "#lib/domain/date.ts";
import { nextActionable } from "#lib/domain/statement.ts";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";
import { bootstrap } from "#lib/ui/page.ts";

/** Renders the dashboard page into `root`, wiring it to `repo`. Exported for tests and for Tasks 11-12 to extend. */
export function renderDashboardPage(repo: Repository, root: HTMLElement): void {
	const now = today();
	let cards: Card[] = [];
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let error = "";

	const load = async (preserveError = false) => {
		try {
			cards = (await repo.listCards()).filter((card) => !card.archived);
			purchases = (
				await Promise.all(cards.map((card) => repo.listPurchases(card.id)))
			).flat();
			payments = (
				await Promise.all(cards.map((card) => repo.listPayments(card.id)))
			).flat();
			if (!preserveError) error = "";
		} catch (failure) {
			error =
				failure instanceof Error
					? failure.message
					: "Could not read your cards.";
		}
		paint();
	};

	const guard = async (action: () => Promise<void>, message: string) => {
		let failed = false;
		try {
			await action();
			error = "";
		} catch (failure) {
			error =
				failure instanceof Error ? `${message} ${failure.message}` : message;
			failed = true;
		}
		// Refresh from storage either way, but keep a failure's message on screen
		// instead of letting a successful read silently wipe it.
		await load(failed);
	};

	const onMarkPaid = (event: CustomEvent<{ cardId: string; period: string }>) =>
		guard(async () => {
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

	const rows = (): DueRow[] =>
		cards.map((card) => ({
			card,
			statement: nextActionable(card, purchases, payments, now),
		}));

	const paint = () =>
		render(
			html`
				<h1>Dashboard</h1>
				<cc-error-banner .message=${error} retry-label="Reload" @retry=${() => load()}></cc-error-banner>
				<article>
					<h2>Due next</h2>
					<cc-due-list .rows=${rows()} .today=${now} @mark-paid=${onMarkPaid}></cc-due-list>
				</article>
			`,
			root,
		);

	void load();
}

bootstrap((repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderDashboardPage(repo, root);
});
