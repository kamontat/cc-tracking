import "#components/cc-list-reply";
import { html, render } from "lit";
import { headerDate, today } from "#lib/domain/date";
import { sequentialIds } from "#lib/domain/list-entry";
import { saveReply } from "#lib/domain/purchase-list";
import type { ListLine, Purchase, PurchaseList } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { getLocale, subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { listPageAddress } from "#lib/ui/list-address";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { createPageState } from "#lib/ui/page-state";
import {
	banner,
	elsewhereView,
	type ListPageOptions,
	listId,
	listPageDefaults,
	markListPage,
} from "./common";

/**
 * Renders the spender's reply to the waiting list named by the address's `id` into `root`.
 * Saving writes the purchases and the saved list, then leaves for the saved list's own page.
 * A list in any other state (or none) says so and links to where it can be opened.
 */
export function renderReplyPage(
	repo: Repository,
	root: HTMLElement,
	options: ListPageOptions = {},
): void {
	const { clock, search, navigate } = listPageDefaults(options);
	markListPage(root);
	const now = today(clock());
	const id = listId(search);
	let data: MoneyData | null = null;
	// Set once a write succeeds: the page is on its way out, so it keeps what it shows rather
	// than flash the list's new state before the next page opens.
	let leaving = false;

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "purchaseList.error.read",
		paint: () => paint(),
	});

	/**
	 * A failed save may already have written purchases and a moved draft under this list's ids,
	 * for answers that have changed since (a line now not made, say). Each purchase would count
	 * twice and the draft would linger, so anything named `<list id>-<n>` that this save does
	 * not write again is removed first. A longer name (`<list id>-2-0`, the moved draft's own
	 * purchase) or any other id is not this save's and is left alone.
	 */
	const dropStale = async (
		list: PurchaseList,
		keep: Purchase[],
		keepDraft: string | undefined,
	) => {
		const kept = new Set(keep.map((p) => `${p.cardId}/${p.id}`));
		const prefix = `${list.id}-`;
		const ours = (id: string) =>
			id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length));
		for (const cardId of new Set(list.lines.map((line) => line.cardId))) {
			for (const purchase of await repo.listPurchases(cardId)) {
				if (ours(purchase.id) && !kept.has(`${cardId}/${purchase.id}`))
					await repo.deletePurchase(cardId, purchase.id);
			}
		}
		for (const other of await repo.listPurchaseLists()) {
			if (ours(other.id) && other.id !== keepDraft)
				await repo.deletePurchaseList(other.id);
		}
	};

	/**
	 * Writes the reply against the list as stored now, not the copy this page loaded: a list
	 * saved since (in another tab, say) is refused, so its purchases are never written twice.
	 * The ids come from the list's own id, so a retry after a failed write overwrites what that
	 * write left. Purchases go first and the saved list last: until the list says saved, the
	 * reply stays on screen to retry.
	 */
	const onSaveReply = async (
		event: CustomEvent<{ lines: ListLine[]; moveUnmade: boolean }>,
	) => {
		const { lines, moveUnmade } = event.detail;
		let saved: PurchaseList | undefined;
		await state.guard(async () => {
			const stored = (await repo.listPurchaseLists()).find((l) => l.id === id);
			if (!stored) throw new MessageError("purchaseList.missing");
			if (stored.status === "saved")
				throw new MessageError("reply.error.alreadySaved");
			const result = saveReply(
				{ ...stored, lines },
				{
					now: clock().toISOString(),
					newId: sequentialIds(stored.id),
					moveUnmade,
				},
			);
			if (!result.ok) throw new MessageError("reply.error.unanswered");
			await dropStale(stored, result.purchases, result.draft?.id);
			for (const purchase of result.purchases)
				await repo.savePurchase(purchase);
			if (result.draft) await repo.savePurchaseList(result.draft);
			await repo.savePurchaseList(result.saved);
			saved = result.saved;
			leaving = true;
		}, "reply.error.save");
		if (saved) navigate(listPageAddress(saved));
	};

	/**
	 * Deletes the waiting list at once, with no second step (the user's decision, DD-74), so it
	 * stops holding room; nothing was bought. A list no longer waiting (saved in another tab,
	 * say) is refused, so a saved list never loses its record.
	 */
	const onCancel = async () => {
		let cancelled = false;
		await state.guard(async () => {
			const stored = (await repo.listPurchaseLists()).find((l) => l.id === id);
			if (!stored) throw new MessageError("purchaseList.missing");
			if (stored.status !== "sent")
				throw new MessageError("reply.error.notWaiting");
			await repo.deletePurchaseList(stored.id);
			cancelled = true;
			leaving = true;
		}, "reply.error.cancel");
		if (cancelled) navigate("/");
	};

	const replyView = (list: PurchaseList, from: MoneyData) => html`
		${backHeader({
			title: t("reply.title"),
			detail: t("reply.listFor", {
				date: headerDate(list.date, getLocale(), false),
			}),
			back: "/",
		})}
		${banner(state)}
		<cc-list-reply .list=${list} .cards=${from.cards} @save-reply=${onSaveReply}
			><button data-variant="danger" data-action="cancel-list" slot="side" @click=${onCancel}>${t("reply.cancel")}</button></cc-list-reply>
	`;

	const paint = () => {
		if (leaving) return;
		let body: unknown = banner(state);
		if (data) {
			const list = data.lists.find((l) => l.id === id);
			body =
				list?.status === "sent"
					? replyView(list, data)
					: elsewhereView(list, state);
		}
		render(body, root);
	};

	subscribe(() => paint());
	void state.load();
}
