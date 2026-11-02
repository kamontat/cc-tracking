import type { CcErrorBanner } from "#components/cc-error-banner";
import type { Card, PurchaseList } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";
import type { ListPageOptions } from "./common";

/** Shared by the list pages' tests: a seeded repository, a mounted root, the page's options. */

export const settle = (ms = 0) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

export const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

export const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `${id} card`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
});

export const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 });
	await repo.saveCard(card("A"));
	await repo.saveCard(card("B"));
	await repo.saveCard(card("Z", { archived: true }));
	await repo.saveSettings({ purchaseLocations: ["krabi"] });
};

export const CLOCK = () => new Date("2026-10-31T03:00:00Z");

/**
 * Seeds a repository (or the one given), runs `before`, then renders a page into a fresh root
 * with a fixed clock and a navigate that records where it went.
 */
export const setupPage = async (
	render: (
		repo: Repository,
		root: HTMLElement,
		options: Required<ListPageOptions>,
	) => void,
	options: {
		repo?: Repository | undefined;
		search: string;
		before?: ((repo: Repository) => Promise<void>) | undefined;
	},
) => {
	setLocale("en");
	const repo = options.repo ?? new InMemoryRepository();
	await seed(repo);
	await options.before?.(repo);
	const root = mount();
	const visited: string[] = [];
	render(repo, root, {
		clock: CLOCK,
		search: options.search,
		navigate: (url) => {
			visited.push(url);
		},
	});
	await settle();
	return { root, repo, visited };
};

export const click = async (root: HTMLElement, action: string) => {
	const button = root.querySelector<HTMLElement>(`[data-action="${action}"]`);
	if (!button) throw new Error(`no ${action}`);
	button.click();
	await settle();
};

export const stored = async (repo: Repository): Promise<PurchaseList[]> =>
	repo.listPurchaseLists();

export const bannerText = (root: HTMLElement) =>
	root.querySelector<CcErrorBanner>("cc-error-banner")?.message ?? "";

export const flatText = (el: Element | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

/** The heading's own text, without the detail under it. */
export const titleOf = (h1: Element | null) => {
	const copy = h1?.cloneNode(true) as Element | undefined;
	copy?.querySelector("small")?.remove();
	return flatText(copy);
};

export const draft = (
	id: string,
	cardIds: string[],
	extra: Partial<PurchaseList> = {},
): PurchaseList => ({
	id,
	date: "2026-11-02",
	status: "draft",
	lines: cardIds.map((cardId) => ({ cardId, amount: 100 })),
	...extra,
});

export const sent = (id: string, cardIds: string[]): PurchaseList => ({
	id,
	date: "2026-10-30",
	status: "sent",
	sentAt: "2026-10-30T03:00:00.000Z",
	lines: cardIds.map((cardId) => ({ cardId, amount: 100 })),
});

export const saved = (id: string, cardIds: string[]): PurchaseList => ({
	id,
	date: "2026-10-30",
	status: "saved",
	sentAt: "2026-10-30T03:00:00.000Z",
	savedAt: "2026-10-30T09:00:00.000Z",
	lines: cardIds.map((cardId) => ({ cardId, amount: 100, made: true })),
});

/** Where the page's "this list is elsewhere" view leads, or null when it is not shown. */
export const elsewhereLink = (root: HTMLElement) =>
	root.querySelector('[data-action="open-list"]')?.getAttribute("href") ?? null;
