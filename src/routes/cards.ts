import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-card-form";
import "#components/cc-card-table";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import { html, nothing, render } from "lit";
import type { Card } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { subscribe, t } from "#lib/i18n/index";
import { takeResetNotice } from "#lib/storage/migrate-locations";
import type { Repository } from "#lib/storage/repository";
import { exportBackup, importBackup, parseBackup } from "#lib/storage/transfer";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

/**
 * Turns a repository's contents into a backup file's text and filename. Split out from the
 * click handler because `URL.createObjectURL` and a synthetic `<a>` click aren't meaningfully
 * testable outside a browser; this half is, and it's the half with logic worth covering.
 */
export async function prepareBackupFile(
	repo: Repository,
	now: Date = new Date(),
): Promise<{ filename: string; text: string }> {
	const backup = await exportBackup(repo, now);
	return {
		text: JSON.stringify(backup, null, 2),
		filename: `cc-tracking-${backup.exportedAt.slice(0, 10)}.json`,
	};
}

/** Renders the card registry page into `root`, wiring it to `repo`. Exported for tests and for Task 14 to extend. */
export function renderCardsPage(
	repo: Repository,
	root: HTMLElement,
	storage: Storage = globalThis.localStorage,
): void {
	let cards: Card[] = [];
	let counts: Record<string, number> = {};
	let editing: Card | null = null;
	// Read once per page load: the notice is consumed here, not on every paint.
	let resetNames = takeResetNotice(storage);

	const state = createPageState({
		fetch: async () => {
			cards = await repo.listCards();
			counts = Object.fromEntries(
				await Promise.all(
					cards.map(
						async (card) =>
							[card.id, (await repo.listPurchases(card.id)).length] as const,
					),
				),
			);
		},
		fallbackKey: "cards.error.read",
		paint: () => paint(),
	});

	const onSave = (event: CustomEvent<Card>) =>
		state.guard(async () => {
			const card = event.detail;
			if (!editing) {
				const existing = await repo.getCard(card.id);
				if (existing) {
					throw new MessageError("cards.error.duplicateId", { id: card.id });
				}
			}
			await repo.saveCard(card);
			editing = null;
		}, "cards.error.save");

	const onRemove = (event: CustomEvent<string>) =>
		state.guard(() => repo.deleteCard(event.detail), "cards.error.delete");

	const onArchive = (event: CustomEvent<string>) =>
		state.guard(async () => {
			const card = cards.find((c) => c.id === event.detail);
			if (card) await repo.saveCard({ ...card, archived: !card.archived });
		}, "cards.error.archive");

	const onEdit = (event: CustomEvent<string>) => {
		editing = cards.find((c) => c.id === event.detail) ?? null;
		paint();
	};

	const onExport = () =>
		state.guard(async () => {
			const { filename, text } = await prepareBackupFile(repo);
			const url = URL.createObjectURL(
				new Blob([text], { type: "application/json" }),
			);
			const link = document.createElement("a");
			link.href = url;
			link.download = filename;
			link.click();
			// Revoking synchronously after click() risks revoking before the browser
			// has started reading the blob (a long-standing source of dropped
			// downloads in some browsers); deferring it a tick is the safe pattern.
			setTimeout(() => URL.revokeObjectURL(url), 0);
		}, "cards.error.export");

	const onImport = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = "";
		return state.guard(async () => {
			await importBackup(repo, parseBackup(await file.text()));
		}, "cards.error.import");
	};

	const paint = () =>
		render(
			html`
				<h1>${t("cards.title")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${
					resetNames.length > 0
						? html`
							<article data-testid="location-reset">
								<p>${t("cards.locationReset", { names: resetNames.join(", ") })}</p>
								<button class="secondary" type="button" @click=${() => {
									resetNames = [];
									paint();
								}}>${t("common.dismiss")}</button>
							</article>
						`
						: nothing
				}
				<article>
					<h2>${editing ? t("cards.edit", { name: editing.name }) : t("cards.add")}</h2>
					<cc-card-form
						.card=${editing}
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
				<article>
					<h2>${t("cards.backup")}</h2>
					<p><small>${t("cards.backupWarning")}</small></p>
					<button class="secondary" type="button" @click=${onExport}>${t("cards.export")}</button>
					<label>${t("cards.import")} <input type="file" accept="application/json" @change=${onImport} /></label>
				</article>
			`,
			root,
		);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.cards", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderCardsPage(repo, root);
});
