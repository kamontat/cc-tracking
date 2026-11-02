import "#components/cc-error-banner";
import { html, type TemplateResult } from "lit";
import type { PurchaseList } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { t } from "#lib/i18n/index";
import { backHeader } from "#lib/ui/back-header";
import { listPageAddress } from "#lib/ui/list-address";
import type { PageState } from "#lib/ui/page-state";

/** What every list page takes from a test; the browser's own by default. */
export type ListPageOptions = {
	/** The page's only clock reading: today's date, and when a list is marked sent or saved. */
	clock?: () => Date;
	/** The address's query; `location.search` unless a test passes its own. */
	search?: string;
	/**
	 * Leaves for another page after a write; `location.replace`, so Back does not reopen the
	 * list just written, unless a test records it instead.
	 */
	navigate?: (url: string) => void;
};

/**
 * Marks `<html data-list-page>`, so the shell hides the floating + New menu on every list
 * page: the reader is mid-list, and the bottom bars need the full width.
 */
export const markListPage = (root: HTMLElement): void => {
	root.ownerDocument.documentElement.setAttribute("data-list-page", "");
};

/** The defaults behind `ListPageOptions`. */
export const listPageDefaults = (options: ListPageOptions) => ({
	clock: options.clock ?? (() => new Date()),
	search: options.search ?? location.search,
	navigate: options.navigate ?? ((url: string) => location.replace(url)),
});

/** The `id` of the stored list a page opens, or null when the address has none. */
export const listId = (search: string): string | null =>
	new URLSearchParams(search).get("id");

export const banner = (state: PageState): TemplateResult =>
	html`<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>`;

/** What a list in another state is, and the link to its own page. */
const ELSEWHERE: Record<
	PurchaseList["status"],
	{ says: MessageKey; open: MessageKey }
> = {
	draft: { says: "purchaseList.isDraft", open: "purchaseList.openDraft" },
	sent: { says: "purchaseList.isSent", open: "purchaseList.openReply" },
	saved: { says: "purchaseList.isSaved", open: "purchaseList.openSaved" },
};

/**
 * A page opened on a list it does not show: an id that is not stored says so and leads Home;
 * a list in another state says which and leads to its own page.
 */
export const elsewhereView = (
	list: PurchaseList | undefined,
	state: PageState,
): TemplateResult => html`
	${backHeader({ title: t("purchaseList.title"), back: "/" })}
	${banner(state)}
	${
		list
			? html`<p class="placeholder">${t(ELSEWHERE[list.status].says)}</p>
				<a data-action="open-list" href=${listPageAddress(list)}>${t(ELSEWHERE[list.status].open)}</a>`
			: html`<p class="placeholder">${t("purchaseList.missing")}</p>
				<a href="/">${t("purchaseList.toHome")}</a>`
	}
`;
