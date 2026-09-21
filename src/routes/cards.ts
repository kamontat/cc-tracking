import "@picocss/pico/css/pico.min.css";
import "#components/cc-card-form.ts";
import "#components/cc-card-table.ts";
import "#components/cc-error-banner.ts";
import { html, render } from "lit";
import type { Card } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";
import { bootstrap } from "#lib/ui/page.ts";

/** Renders the card registry page into `root`, wiring it to `repo`. Exported for tests and for Task 14 to extend. */
export function renderCardsPage(repo: Repository, root: HTMLElement): void {
	let cards: Card[] = [];
	let counts: Record<string, number> = {};
	let editing: Card | null = null;
	let error = "";

	const load = async (preserveError = false) => {
		try {
			cards = await repo.listCards();
			counts = Object.fromEntries(
				await Promise.all(
					cards.map(
						async (card) =>
							[card.id, (await repo.listPurchases(card.id)).length] as const,
					),
				),
			);
			if (!preserveError) error = "";
		} catch (failure) {
			error =
				failure instanceof Error
					? failure.message
					: "Could not read the card list.";
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

	const onSave = (event: CustomEvent<Card>) =>
		guard(async () => {
			const card = event.detail;
			if (!editing) {
				const existing = await repo.getCard(card.id);
				if (existing) {
					throw new Error(
						`A card with id "${card.id}" already exists. Card ids must be unique.`,
					);
				}
			}
			await repo.saveCard(card);
			editing = null;
		}, "Could not save the card.");

	const onRemove = (event: CustomEvent<string>) =>
		guard(() => repo.deleteCard(event.detail), "Could not delete the card.");

	const onArchive = (event: CustomEvent<string>) =>
		guard(async () => {
			const card = cards.find((c) => c.id === event.detail);
			if (card) await repo.saveCard({ ...card, archived: !card.archived });
		}, "Could not archive the card.");

	const onEdit = (event: CustomEvent<string>) => {
		editing = cards.find((c) => c.id === event.detail) ?? null;
		paint();
	};

	const paint = () =>
		render(
			html`
				<h1>Cards</h1>
				<cc-error-banner .message=${error} retry-label="Reload" @retry=${() => load()}></cc-error-banner>
				<article>
					<h2>${editing ? `Edit ${editing.name}` : "Add a card"}</h2>
					<cc-card-form
						.card=${editing}
						.locations=${[...new Set(cards.map((c) => c.location))].sort()}
						@save=${onSave}
						@cancel=${() => {
							editing = null;
							paint();
						}}
					></cc-card-form>
				</article>
				<cc-card-table
					.cards=${cards}
					.purchaseCounts=${counts}
					@edit=${onEdit}
					@archive=${onArchive}
					@remove=${onRemove}
				></cc-card-table>
			`,
			root,
		);

	void load();
}

bootstrap((repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderCardsPage(repo, root);
});
