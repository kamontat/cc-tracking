import { html, nothing, render } from "lit";
import { headerDate } from "#lib/domain/date";
import type { PlainDate } from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { getLocale, t } from "#lib/i18n/index";
import { type Environment, envMark } from "#lib/ui/build-info";
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
 * the registry leads from; a purchase list (`/list`) sits under Home, where it starts and
 * waits. One trailing slash is ignored, so `/cards/` is still Cards.
 */
export function currentTab(path: string): Tab | null {
	const bare = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
	if (bare === "/card") return "cards";
	if (bare === "/list") return "home";
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
 * Renders the header into `#site-header`, and the bottom tab bar and the floating Payment
 * button into `#tabbar`. Both navs are always in the document; the stylesheet shows the bottom
 * bar on a phone and the header tabs from 900px, so the current page is marked in both. The
 * header date carries both of its forms, and the stylesheet shows one per screen size.
 */
export function renderShell(
	view: ShellView,
	root: ParentNode = document,
): void {
	const current = currentTab(view.path);
	const mark = envMark(view.environment, view.pr);
	const locale = getLocale();
	const tab = ([name, path, label]: (typeof TABS)[number]) =>
		tabLink(name, path, label, current);

	const header = root.querySelector<HTMLElement>("#site-header");
	if (header) {
		render(
			html`<div class="site-header__bar">
				<div class="site-header__id">
					<a class="site-header__brand" href="/" aria-label=${t("nav.brand")}
						><span class="site-header__mark">cc</span>tracking</a
					>${
						mark === null
							? nothing
							: html`<span class="site-header__env" data-testid="env-mark"
									>${mark}</span
								>`
					}<span class="site-header__sep" aria-hidden="true">·</span
					><span class="site-header__date" data-testid="today"
						><span class="site-header__date-short"
							>${headerDate(view.today, locale, false)}</span
						><span class="site-header__date-long"
							>${headerDate(view.today, locale, true)}</span
						></span
					>
				</div>
				<nav class="site-header__tabs" aria-label=${t("nav.pages")}>
					${TABS.map(tab)}
				</nav>
			</div>`,
			header,
		);
	}

	const tabbar = root.querySelector<HTMLElement>("#tabbar");
	if (tabbar) {
		// Payment floats over every page, so it lives outside the bar, which a desktop hides.
		render(
			html`<nav class="tabbar" aria-label=${t("nav.pages")}>
					${TABS.map(tab)}
				</nav>
				<a
					class="fab"
					data-action="pay"
					href="/transactions"
					aria-label=${t("nav.payment")}
					>${icons.plus}<span class="fab__label">${t("nav.payment")}</span></a
				>`,
			tabbar,
		);
	}
}
