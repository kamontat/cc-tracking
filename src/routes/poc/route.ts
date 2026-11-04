/**
 * POC: a sheet whose address is a path, not a query key.
 *
 * `/poc/items` is the list; `/poc/items/new`, `/poc/items/<id>` and `/poc/items/<id>/edit` are
 * the same page with a sheet open. In the app the sheet opens with `pushState` (no reload) and
 * Back closes it; loaded directly, a `_redirects` 200 rule serves `items.html` for the deeper
 * path and the page opens the sheet from `location.pathname`.
 */
export type Sheet =
	| { kind: "none" }
	| { kind: "new" }
	| { kind: "view"; id: string }
	| { kind: "edit"; id: string };

export const BASE = "/poc/items";

/** The sheet a path names; anything unknown reads as no sheet. */
export function parseSheet(pathname: string): Sheet {
	const bare =
		pathname.length > 1 && pathname.endsWith("/")
			? pathname.slice(0, -1)
			: pathname;
	if (!bare.startsWith(`${BASE}/`)) return { kind: "none" };
	const parts = bare
		.slice(BASE.length + 1)
		.split("/")
		.map(decodeURIComponent);
	if (parts.length === 1 && parts[0] === "new") return { kind: "new" };
	if (parts.length === 1 && parts[0]) return { kind: "view", id: parts[0] };
	if (parts.length === 2 && parts[0] && parts[1] === "edit")
		return { kind: "edit", id: parts[0] };
	return { kind: "none" };
}

/** The path for a sheet; ids are encoded so a `/` or `#` in one cannot change the route. */
export function sheetPath(sheet: Sheet): string {
	switch (sheet.kind) {
		case "none":
			return BASE;
		case "new":
			return `${BASE}/new`;
		case "view":
			return `${BASE}/${encodeURIComponent(sheet.id)}`;
		case "edit":
			return `${BASE}/${encodeURIComponent(sheet.id)}/edit`;
	}
}
