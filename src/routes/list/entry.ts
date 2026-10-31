import "#components/cc-list-amounts";
import "#components/cc-list-table";
import { html, nothing, render } from "lit";
import { today } from "#lib/domain/date";
import { isReady, roomFor } from "#lib/domain/home";
import { composeList, lineAmount, listLines } from "#lib/domain/list-entry";
import { formatAmountInput } from "#lib/domain/money";
import { plannedOf } from "#lib/domain/pay";
import type { GroupRoom } from "#lib/domain/room";
import type {
	Card,
	ListLine,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types";
import { MessageError, messageOf } from "#lib/i18n/error";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { cardLines } from "#lib/ui/card-label";
import { icons } from "#lib/ui/icons";
import { newListAddress } from "#lib/ui/list-address";
import {
	browserShare,
	imageName,
	type ShareApi,
	shareTable,
	shareText,
} from "#lib/ui/list-share";
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

/** A new list from the cards picked on Home (`/list/new`), or a stored draft (`/list/draft`). */
export type EntryMode = "new" | "draft";

export type EntryPageOptions = ListPageOptions & {
	/** What this browser can do with the review's table; `browserShare()` by default. */
	share?: ShareApi;
	/** The id a new list is stored under; `crypto.randomUUID` by default. */
	newId?: () => string;
	/** Rewrites the address without a history entry; `history.replaceState` by default. */
	replaceAddress?: (url: string) => void;
};

/** `elsewhere` is a draft page opened on an id that is not stored, or not a draft. */
type View = "loading" | "amounts" | "review" | "elsewhere";

/** How the last Copy text or Save image went, kept raw so it re-translates on a locale switch. */
type ShareStatus =
	| { kind: "copied" }
	| { kind: "copy-failed" }
	| { kind: "image-saved" }
	| { kind: "image-shared" }
	| { kind: "image-failed"; failure: unknown };

const unique = (ids: string[]): string[] => [...new Set(ids)];

/**
 * Renders the two steps of writing a purchase list into `root`: enter amounts, then review the
 * table and mark it sent or keep it as a draft. `new` starts from the address's `card`
 * parameters; `draft` reopens the stored draft named by `id`, whose own lines hold no room.
 * Everything the reader typed lives here, so going back from the review loses nothing, and a
 * failed save keeps the review on screen under the banner.
 */
export function renderEntryPage(
	repo: Repository,
	root: HTMLElement,
	mode: EntryMode,
	options: EntryPageOptions = {},
): void {
	const { clock, search, navigate } = listPageDefaults(options);
	markListPage(root);
	const share = options.share ?? browserShare();
	const newId = options.newId ?? (() => crypto.randomUUID());
	const replaceAddress =
		options.replaceAddress ??
		((url: string) => history.replaceState(history.state, "", url));
	const now = today(clock());
	let data: MoneyData | null = null;
	let view: View = "loading";
	// The stored draft being edited, if any; its id is kept and its own lines hold no room.
	let editingId: string | undefined;
	// What a draft page found instead of a draft: nothing, or a list in another state.
	let elsewhere: PurchaseList | undefined;
	// The id this page saves under, fixed on the first save so a retry overwrites, not doubles.
	let saveId: string | undefined;
	let cardIds: string[] = [];
	// Cards a reopened draft (or this page) had that can no longer take purchases, left out.
	let dropped: string[] = [];
	let date: PlainDate = now;
	let entries: Record<string, string> = {};
	let notes: Record<string, string> = {};
	let reviewed: { date: PlainDate; lines: ListLine[] } | null = null;
	let status: ShareStatus | null = null;

	const readyCards = (from: MoneyData): Card[] =>
		from.cards.filter((card) => isReady(card, from.groups, from.settings));

	// Reads the address once, against the first data that loads.
	const start = (from: MoneyData) => {
		const ready = new Set(readyCards(from).map((card) => card.id));
		if (mode === "new") {
			const params = new URLSearchParams(search);
			cardIds = unique(params.getAll("card")).filter((c) => ready.has(c));
			view = "amounts";
			return;
		}
		const id = listId(search);
		const list = from.lists.find((l) => l.id === id);
		if (list?.status !== "draft") {
			elsewhere = list;
			view = "elsewhere";
			return;
		}
		editingId = list.id;
		date = list.date;
		const onList = unique(list.lines.map((line) => line.cardId));
		cardIds = onList.filter((c) => ready.has(c));
		dropped = onList.filter((c) => !ready.has(c));
		entries = {};
		notes = {};
		for (const line of list.lines) {
			if (!cardIds.includes(line.cardId)) continue;
			entries[line.cardId] = formatAmountInput(line.amount);
			if (line.note) notes[line.cardId] = line.note;
		}
		view = "amounts";
	};

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
			if (view === "loading") start(data);
		},
		fallbackKey: "purchaseList.error.read",
		paint: () => paint(),
	});

	const show = (next: View) => {
		view = next;
		status = null;
		paint();
	};

	const onEntryChange = (
		event: CustomEvent<{
			date: PlainDate;
			entries: Record<string, string>;
			notes?: Record<string, string>;
		}>,
	) => {
		date = event.detail.date;
		entries = { ...event.detail.entries };
		notes = { ...event.detail.notes };
	};

	const onReview = (event: CustomEvent<{ date: PlainDate }>) => {
		date = event.detail.date;
		// Lines come from the cards on the list now: the typed amounts can still hold a key for a
		// card that was removed.
		const amounts: Record<string, number> = {};
		for (const id of cardIds) amounts[id] = lineAmount(entries[id] ?? "") ?? 0;
		reviewed = { date, lines: listLines(cardIds, amounts, notes) };
		show("review");
	};

	// A new list's address names its cards, so a reload or shared link shows the same ones; a
	// draft's cards come from the stored draft, so its address stays as it is.
	const syncAddress = () => {
		if (mode === "new") replaceAddress(newListAddress(cardIds, search));
	};

	const onRemove = (event: CustomEvent<{ cardId: string }>) => {
		cardIds = cardIds.filter((id) => id !== event.detail.cardId);
		syncAddress();
		paint();
	};

	const onAdd = (event: CustomEvent<{ cardId: string }>) => {
		if (!cardIds.includes(event.detail.cardId))
			cardIds = [...cardIds, event.detail.cardId];
		syncAddress();
		paint();
	};

	const table = () =>
		reviewed && data ? shareTable(reviewed, data.cards) : null;

	const copy = async () => {
		const words = table();
		if (!share.copy || !words) return;
		try {
			await share.copy(shareText(words));
			status = { kind: "copied" };
		} catch {
			status = { kind: "copy-failed" };
		}
		paint();
	};

	const saveImage = async () => {
		const words = table();
		if (!share.saveImage || !words || !reviewed) return;
		try {
			const outcome = await share.saveImage(words, imageName(reviewed.date));
			// Closing the share sheet is the reader changing their mind, not a failure.
			status =
				outcome === "cancelled"
					? null
					: { kind: outcome === "shared" ? "image-shared" : "image-saved" };
		} catch (failure) {
			status = { kind: "image-failed", failure };
		}
		paint();
	};

	/**
	 * The draft as stored now: one sent or saved since (in another tab, say) is not written
	 * over, as the reply page refuses a list already saved.
	 */
	const storedDraft = async (id: string): Promise<PurchaseList> => {
		const current = (await repo.listPurchaseLists()).find((l) => l.id === id);
		if (!current) throw new MessageError("purchaseList.missing");
		if (current.status !== "draft")
			throw new MessageError("purchaseList.error.notDraft");
		return current;
	};

	const save = async (send: boolean) => {
		const list = reviewed;
		if (!list) return;
		let saved = false;
		await state.guard(async () => {
			if (editingId) await storedDraft(editingId);
			saveId ??= editingId ?? newId();
			await repo.savePurchaseList(
				composeList({
					id: saveId,
					date: list.date,
					lines: list.lines,
					send,
					now: clock().toISOString(),
				}),
			);
			saved = true;
		}, "purchaseList.error.save");
		if (saved) navigate("/");
	};

	/**
	 * Deletes the stored draft at once, with no second step (the user's decision, DD-74): it
	 * holds nothing that was bought. A draft sent or saved since is refused, like a save.
	 */
	const deleteDraft = async () => {
		const id = editingId;
		if (!id) return;
		let deleted = false;
		await state.guard(async () => {
			await storedDraft(id);
			await repo.deletePurchaseList(id);
			deleted = true;
		}, "purchaseList.error.delete");
		if (deleted) navigate("/");
	};

	/** Delete draft, on a draft's page only; `side` slots it into a list element's panel. */
	const deleteButton = (slot?: "side") =>
		editingId
			? html`<button data-variant="danger" data-action="delete-draft" slot=${slot ?? nothing} @click=${deleteDraft}>${t("purchaseList.deleteDraft")}</button>`
			: nothing;

	const statusText = (): string => {
		if (!status) return "";
		switch (status.kind) {
			case "copied":
				return t("purchaseList.copied");
			case "copy-failed":
				return t("backup.error.copy");
			case "image-saved":
				return t("purchaseList.imageSaved");
			case "image-shared":
				return t("purchaseList.imageShared");
			case "image-failed":
				return messageOf(status.failure, "purchaseList.error.image");
		}
	};

	const amountsView = (from: MoneyData) => {
		const ready = readyCards(from);
		const byId = new Map(ready.map((card) => [card.id, card]));
		// A card that stopped being ready since the page opened drops off the list, and says so.
		const gone = cardIds.filter((id) => !byId.has(id));
		if (gone.length > 0) {
			dropped = unique([...dropped, ...gone]);
			cardIds = cardIds.filter((id) => byId.has(id));
		}
		const cards = cardIds.flatMap((id) => byId.get(id) ?? []);
		const rooms = new Map<string, GroupRoom>();
		for (const card of cards) {
			const room = roomFor(card, from, editingId);
			if (room) rooms.set(card.id, room);
		}
		return html`
			${backHeader({
				title: t(editingId ? "purchaseList.draft" : "purchaseList.new"),
				// A new list goes back to the picker it came from; a draft goes Home (DD-103).
				back: mode === "new" ? "/list/new" : "/",
			})}
			${banner(state)}
			${
				dropped.length > 0
					? html`<p class="note" data-dropped>${t(
							dropped.length === 1
								? "purchaseList.dropped.one"
								: "purchaseList.dropped.many",
							{ cards: cardLines(dropped, from.cards) },
						)}</p>`
					: nothing
			}
			<cc-list-amounts
				.cards=${cards}
				.allCards=${from.cards}
				.groups=${from.groups}
				.planned=${plannedOf(from.payments)}
				.candidates=${ready.filter((card) => !cardIds.includes(card.id))}
				.rooms=${rooms}
				.ledgers=${from.ledgers}
				.today=${now}
				.date=${date}
				.entries=${entries}
				.notes=${notes}
				@entry-change=${onEntryChange}
				@review=${onReview}
				@remove=${onRemove}
				@add=${onAdd}
			>${deleteButton("side")}</cc-list-amounts>
		`;
	};

	const reviewView = (from: MoneyData) => html`
		${backHeader({
			title: t("purchaseList.reviewTitle"),
			back: () => show("amounts"),
		})}
		${banner(state)}
		<div class="list-layout">
		<div class="list-layout__main">
			<cc-list-table .list=${reviewed ?? { date, lines: [] }} .cards=${from.cards}></cc-list-table>
		</div>
		<div class="list-layout__side">
		${
			share.copy || share.saveImage
				? html`<div class="list-share" row>
					${
						share.copy
							? html`<button data-variant="quiet" data-action="copy" @click=${copy}>${icons.copy}${t("backup.copy")}</button>`
							: nothing
					}
					${
						share.saveImage
							? html`<button data-variant="quiet" data-action="save-image" @click=${saveImage}>${icons.image}${t("purchaseList.saveImage")}</button>`
							: nothing
					}
				</div>`
				: nothing
		}
		<p class="status" role="status" ?data-failed=${status?.kind === "copy-failed" || status?.kind === "image-failed"}>${statusText()}</p>
		<p class="note">${t("purchaseList.sendHint")}</p>
		<button data-action="mark-sent" @click=${() => save(true)}>${icons.send}${t("purchaseList.markSent")}</button>
		<button data-variant="quiet" data-action="save-draft" @click=${() => save(false)}>${t("purchaseList.saveDraft")}</button>
		${deleteButton()}
		</div>
		</div>
	`;

	const paint = () => {
		let body: unknown = banner(state);
		if (view === "elsewhere") body = elsewhereView(elsewhere, state);
		else if (data && view === "amounts") body = amountsView(data);
		else if (data && view === "review") body = reviewView(data);
		render(body, root);
	};

	subscribe(() => paint());
	void state.load();
}
