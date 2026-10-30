import { html, nothing, render } from "lit";
import { displayDate } from "#lib/domain/date";
import type { PlainDate } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { getLocale, t } from "#lib/i18n/index";
import { type Environment, envBadge } from "#lib/ui/build-info";
import { icons } from "#lib/ui/icons";

export type Tab = "home" | "transactions" | "cards" | "settings";

/** The four places, in the order both navs show them. */
export const TABS: readonly (readonly [
	tab: Tab,
	path: string,
	label: MessageKey,
])[] = [
	["home", "/", "nav.home"],
	["transactions", "/transactions", "nav.transactions"],
	["cards", "/cards", "nav.cards"],
	["settings", "/settings", "nav.settings"],
];

/**
 * The tab a path belongs to. A card's own page (`/card`) sits under Cards, where its link in
 * the registry leads from. One trailing slash is ignored, so `/cards/` is still Cards.
 */
export function currentTab(path: string): Tab | null {
	const bare = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
	if (bare === "/card") return "cards";
	return TABS.find(([, tabPath]) => tabPath === bare)?.[0] ?? null;
}

export type ShellView = {
	path: string;
	today: PlainDate;
	environment: Environment;
	pr: string;
};

const tabLink = (
	tab: Tab,
	path: string,
	label: MessageKey,
	current: Tab | null,
) =>
	html`<a
		data-tab=${tab}
		href=${path}
		aria-current=${current === tab ? "page" : nothing}
		>${icons[tab]}<span>${t(label)}</span></a
	>`;

/**
 * Renders the header and the bottom tab bar into the page's `#site-header` and `#tabbar`
 * slots. Both navs are always in the document; the stylesheet shows the bottom bar on a phone
 * and the header tabs from 900px, so the current page is marked in both.
 */
export function renderShell(
	view: ShellView,
	root: ParentNode = document,
): void {
	const current = currentTab(view.path);
	const badge = envBadge(view.environment, view.pr);
	const tab = ([name, path, label]: (typeof TABS)[number]) =>
		tabLink(name, path, label, current);

	const header = root.querySelector<HTMLElement>("#site-header");
	if (header) {
		render(
			html`<div class="site-header__bar">
				<a class="site-header__brand" href="/" aria-label=${t("nav.brand")}
					><span class="site-header__mark">cc</span>tracking</a
				>
				${
					badge === null
						? nothing
						: html`<span class="site-header__badge" data-testid="env-badge"
								>${badge}</span
							>`
				}
				<span class="site-header__date" data-testid="today"
					>${displayDate(view.today, getLocale())}</span
				>
				<nav class="site-header__tabs" aria-label=${t("nav.pages")}>
					${TABS.map(tab)}
				</nav>
				<a class="site-header__pay" data-action="payment" href="/transactions"
					>${icons.plus}<span>${t("nav.payment")}</span></a
				>
			</div>`,
			header,
		);
	}

	const tabbar = root.querySelector<HTMLElement>("#tabbar");
	if (tabbar) {
		// The add button sits in the middle: home and transactions before it, the rest after.
		render(
			html`<nav class="tabbar" aria-label=${t("nav.pages")}>
				${TABS.slice(0, 2).map(tab)}<a
					class="tabbar__add"
					data-action="payment"
					href="/transactions"
					aria-label=${t("nav.payment")}
					>${icons.plus}</a
				>${TABS.slice(2).map(tab)}
			</nav>`,
			tabbar,
		);
	}
}
