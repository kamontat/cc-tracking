import "@picocss/pico/css/pico.min.css";
import "#components/cc-card-form.ts";
import "#components/cc-card-table.ts";
import "#components/cc-error-banner.ts";
import { html, render } from "lit";
import type { Card } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";
import { bootstrap } from "#lib/ui/page.ts";

bootstrap((repo: Repository) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (!root) return;

	let cards: Card[] = [];
	let counts: Record<string, number> = {};
	let editing: Card | null = null;
	let error = "";

	const load = async () => {
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
			error = "";
		} catch (failure) {
			error =
				failure instanceof Error
					? failure.message
					: "Could not read the card list.";
		}
		paint();
	};

	const guard = async (action: () => Promise<void>, message: string) => {
		try {
			await action();
			error = "";
		} catch (failure) {
			error =
				failure instanceof Error ? `${message} ${failure.message}` : message;
		}
		await load();
	};

	const onSave = (event: CustomEvent<Card>) =>
		guard(async () => {
			await repo.saveCard(event.detail);
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
				<cc-error-banner .message=${error} retry-label="Reload" @retry=${load}></cc-error-banner>
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
});
