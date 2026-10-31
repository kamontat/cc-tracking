import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-list-amounts";
import "#components/cc-list-table";
import { html, nothing, render } from "lit";
import { today } from "#lib/domain/date";
import { isReady, roomFor } from "#lib/domain/home";
import { composeList, lineAmount, listLines } from "#lib/domain/list-entry";
import { formatAmountInput } from "#lib/domain/money";
import type { GroupRoom } from "#lib/domain/room";
import type { Card, ListLine, PlainDate } from "#lib/domain/types";
import { messageOf } from "#lib/i18n/error";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { icons } from "#lib/ui/icons";
import {
	browserShare,
	imageName,
	type ShareApi,
	shareTable,
	shareText,
} from "#lib/ui/list-share";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

export type ListPageOptions = {
	/** The page's only clock reading: today's date, and when a list is marked sent. */
	clock?: () => Date;
	/** The address's query; `location.search` unless a test passes its own. */
	search?: string;
	/** Opens another page; `location.assign` unless a test records it instead. */
	navigate?: (url: string) => void;
	/** What this browser can do with the review's table; `browserShare()` by default. */
	share?: ShareApi;
	/** The id a new list is stored under; `crypto.randomUUID` by default. */
	newId?: () => string;
};

type View = "loading" | "amounts" | "review" | "missing";

/** How the last Copy text or Save image went, kept raw so it re-translates on a locale switch. */
type ShareStatus =
	| { kind: "copied" }
	| { kind: "copy-failed" }
	| { kind: "image-saved" }
	| { kind: "image-failed"; failure: unknown };

const unique = (ids: string[]): string[] => [...new Set(ids)];

/**
 * Renders the purchase list page into `root`: enter amounts for the cards picked on Home (or a
 * reopened draft), review the table, then mark it sent or keep it as a draft. Everything the
 * reader typed lives here, so going back from the review loses nothing, and a failed save
 * keeps the review on screen under the banner.
 */
export function renderListPage(
	repo: Repository,
	root: HTMLElement,
	{
		clock = () => new Date(),
		search = location.search,
		navigate = (url) => location.assign(url),
		share = browserShare(),
		newId = () => crypto.randomUUID(),
	}: ListPageOptions = {},
): void {
	const now = today(clock());
	let data: MoneyData | null = null;
	let view: View = "loading";
	// The stored draft being edited, if any; its id is kept and its own lines hold no room.
	let editingId: string | undefined;
	// The id this page saves under, fixed on the first save so a retry overwrites, not doubles.
	let saveId: string | undefined;
	let cardIds: string[] = [];
	let date: PlainDate = now;
	let entries: Record<string, string> = {};
	let reviewed: { date: PlainDate; lines: ListLine[] } | null = null;
	let status: ShareStatus | null = null;

	const readyCards = (from: MoneyData): Card[] =>
		from.cards.filter((card) => isReady(card, from.groups, from.settings));

	// Reads the address once, against the first data that loads.
	const start = (from: MoneyData) => {
		const ready = new Set(readyCards(from).map((card) => card.id));
		const params = new URLSearchParams(search);
		const id = params.get("id");
		if (id === null) {
			cardIds = unique(params.getAll("card")).filter((c) => ready.has(c));
			view = "amounts";
			return;
		}
		// Only a draft reopens for editing; a sent or saved list has its own page later.
		const list = from.lists.find((l) => l.id === id && l.status === "draft");
		if (!list) {
			view = "missing";
			return;
		}
		editingId = list.id;
		date = list.date;
		cardIds = unique(list.lines.map((line) => line.cardId)).filter((c) =>
			ready.has(c),
		);
		entries = {};
		for (const line of list.lines) {
			if (cardIds.includes(line.cardId))
				entries[line.cardId] = formatAmountInput(line.amount);
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
		event: CustomEvent<{ date: PlainDate; entries: Record<string, string> }>,
	) => {
		date = event.detail.date;
		entries = { ...event.detail.entries };
	};

	const onReview = (event: CustomEvent<{ date: PlainDate }>) => {
		date = event.detail.date;
		// Lines come from the cards on the list now: the typed amounts can still hold a key for a
		// card that was removed.
		const amounts: Record<string, number> = {};
		for (const id of cardIds) amounts[id] = lineAmount(entries[id] ?? "") ?? 0;
		reviewed = { date, lines: listLines(cardIds, amounts) };
		show("review");
	};

	const onRemove = (event: CustomEvent<{ cardId: string }>) => {
		cardIds = cardIds.filter((id) => id !== event.detail.cardId);
		paint();
	};

	const onAdd = (event: CustomEvent<{ cardId: string }>) => {
		if (!cardIds.includes(event.detail.cardId))
			cardIds = [...cardIds, event.detail.cardId];
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
			await share.saveImage(words, imageName(reviewed.date));
			status = { kind: "image-saved" };
		} catch (failure) {
			status = { kind: "image-failed", failure };
		}
		paint();
	};

	const save = async (send: boolean) => {
		const list = reviewed;
		if (!list) return;
		let saved = false;
		await state.guard(async () => {
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

	const statusText = (): string => {
		if (!status) return "";
		switch (status.kind) {
			case "copied":
				return t("purchaseList.copied");
			case "copy-failed":
				return t("backup.error.copy");
			case "image-saved":
				return t("purchaseList.imageSaved");
			case "image-failed":
				return messageOf(status.failure, "purchaseList.error.image");
		}
	};

	const amountsView = (from: MoneyData) => {
		const ready = readyCards(from);
		const byId = new Map(ready.map((card) => [card.id, card]));
		// A card that stopped being ready since the page opened drops off the list.
		cardIds = cardIds.filter((id) => byId.has(id));
		const cards = cardIds.flatMap((id) => byId.get(id) ?? []);
		const rooms = new Map<string, GroupRoom>();
		for (const card of cards) {
			const room = roomFor(card, from, editingId);
			if (room) rooms.set(card.id, room);
		}
		return html`
			${backHeader({
				title: t(editingId ? "purchaseList.draft" : "purchaseList.new"),
				back: "/",
			})}
			${banner()}
			<cc-list-amounts
				.cards=${cards}
				.candidates=${ready.filter((card) => !cardIds.includes(card.id))}
				.rooms=${rooms}
				.ledgers=${from.ledgers}
				.today=${now}
				.date=${date}
				.entries=${entries}
				@entry-change=${onEntryChange}
				@review=${onReview}
				@remove=${onRemove}
				@add=${onAdd}
			></cc-list-amounts>
		`;
	};

	const reviewView = (from: MoneyData) => html`
		${backHeader({
			title: t("purchaseList.reviewTitle"),
			back: () => show("amounts"),
		})}
		${banner()}
		<cc-list-table .list=${reviewed ?? { date, lines: [] }} .cards=${from.cards}></cc-list-table>
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
	`;

	const missingView = () => html`
		${backHeader({ title: t("purchaseList.title"), back: "/" })}
		${banner()}
		<p class="placeholder">${t("purchaseList.missing")}</p>
		<a href="/">${t("purchaseList.toHome")}</a>
	`;

	const banner = () =>
		html`<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>`;

	const paint = () => {
		let body: unknown = banner();
		if (view === "missing") body = missingView();
		else if (data && view === "amounts") body = amountsView(data);
		else if (data && view === "review") body = reviewView(data);
		render(body, root);
	};

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.list", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderListPage(repo, root);
});
