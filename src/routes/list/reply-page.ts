import "#components/cc-list-reply";
import { html, render } from "lit";
import { headerDate, today } from "#lib/domain/date";
import type { ListLine, PurchaseList } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { getLocale, subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { listPageAddress } from "#lib/ui/list-address";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { createPageState } from "#lib/ui/page-state";
import { writeListReply } from "#lib/ui/save-list-reply";
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

	/** Writes the reply (`writeListReply`), then leaves for the saved list's own page. */
	const onSaveReply = async (
		event: CustomEvent<{ lines: ListLine[]; moveUnmade: boolean }>,
	) => {
		const { lines, moveUnmade } = event.detail;
		let saved: PurchaseList | undefined;
		await state.guard(async () => {
			saved = await writeListReply(repo, id ?? "", {
				lines,
				moveUnmade,
				now: clock(),
			});
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
		<cc-list-reply .list=${list} .cards=${from.cards} .groups=${from.groups} @save-reply=${onSaveReply}
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
