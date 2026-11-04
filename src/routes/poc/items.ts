import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "./poc.css";
import { afterExit } from "#lib/ui/motion";
import { BASE, parseSheet, type Sheet, sheetPath } from "./route";

/**
 * POC page: `/poc/items` with a slide-up sheet at `/poc/items/new`, `/poc/items/<id>` and
 * `/poc/items/<id>/edit`. Links are real `<a href>`s; a click is caught and turned into
 * `pushState`, so the sheet slides up without a reload. A middle click, a reload or a pasted
 * address loads the page through the `_redirects` 200 rule and opens the sheet at once.
 */
const ITEMS = ["a1", "b2", "c3", "new-ish", "x/y#z"];
const page = document.querySelector<HTMLElement>("#page");

/** True while the open sheet was pushed by this page, so Close can step back instead. */
let pushed = false;

function link(sheet: Sheet, text: string): string {
	return `<a href="${sheetPath(sheet)}" data-sheet>${text}</a>`;
}

function diagnostics(): string {
	const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
	const styles = [
		...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
	].map((l) => l.href);
	const tokens = getComputedStyle(document.documentElement)
		.getPropertyValue("--cc-space-4")
		.trim();
	return `<dl class="poc-diag">
		<dt>pathname</dt><dd><code>${location.pathname}</code></dd>
		<dt>search</dt><dd><code>${location.search || "(none)"}</code></dd>
		<dt>history.length</dt><dd>${history.length}</dd>
		<dt>pushed by page</dt><dd>${pushed}</dd>
		<dt>script loaded</dt><dd>yes (this text is drawn by it)</dd>
		<dt>tokens.css loaded</dt><dd>${tokens ? `yes (--cc-space-4 = ${tokens})` : "NO"}</dd>
		<dt>script URLs</dt><dd><code>${scripts.join("<br>")}</code></dd>
		<dt>stylesheet URLs</dt><dd><code>${styles.join("<br>")}</code></dd>
	</dl>`;
}

function sheetBody(sheet: Sheet): string {
	switch (sheet.kind) {
		case "none":
			return "";
		case "new":
			return "<h2>New item</h2><p>Sheet for <code>/poc/items/new</code>.</p>";
		case "view":
			return `<h2>Item ${sheet.id}</h2>
				<p>Sheet: one item</p>
				<p>${link({ kind: "edit", id: sheet.id }, "Edit item")} (pushes a second entry; Back returns here)</p>`;
		case "edit":
			return `<h2>Edit ${sheet.id}</h2>
				<p>${link({ kind: "view", id: sheet.id }, "Back: item")}</p>`;
	}
}

/** Draws the page once; only the diagnostics and the sheet change after this. */
function drawPage() {
	if (!page) return;
	page.innerHTML = `
		<h1>POC: sheet addresses as paths</h1>
		<p>Open a sheet, then try Back, Forward, reload, and opening a link in a new tab.</p>
		<ul class="poc-list">
			<li>${link({ kind: "new" }, "New item")}</li>
			${ITEMS.map((id) => `<li>${link({ kind: "view", id }, `Item ${id}`)} · ${link({ kind: "edit", id }, "edit")}</li>`).join("")}
		</ul>
		<p>Other file, deeper path:
			<a href="/poc/other/a1">/poc/other/a1</a> ·
			<a href="/poc/other/a1/deep/er">/poc/other/a1/deep/er</a> ·
			<a href="/poc/items/a1/nope">/poc/items/a1/nope (unknown: no sheet)</a></p>
		<div id="poc-diag"></div>
		<div class="poc-backdrop" hidden></div>
		<section class="poc-sheet" role="dialog" aria-modal="true" hidden>
			<button type="button" class="poc-close">Close</button>
			<div class="poc-sheet-body"></div>
		</section>`;
}

/**
 * Brings the sheet in step with the address. Closed to open slides it up (only when the page
 * itself changed the address; a direct load shows it at once); open to open swaps the content
 * in place; open to closed slides it down and hides it once the animation ends.
 */
function sync(animate: boolean) {
	const diag = document.querySelector("#poc-diag");
	if (diag) diag.innerHTML = diagnostics();
	const el = document.querySelector<HTMLElement>(".poc-sheet");
	const backdrop = document.querySelector<HTMLElement>(".poc-backdrop");
	const body = document.querySelector<HTMLElement>(".poc-sheet-body");
	if (!el || !backdrop || !body) return;
	const sheet = parseSheet(location.pathname);
	const open = !el.hidden && !el.hasAttribute("data-closing");

	if (sheet.kind === "none") {
		if (!open) return;
		el.removeAttribute("data-opening");
		backdrop.removeAttribute("data-opening");
		el.setAttribute("data-closing", "");
		backdrop.setAttribute("data-closing", "");
		afterExit(el, () => {
			// Reopened while sliding down: leave it open.
			if (!el.hasAttribute("data-closing")) return;
			el.removeAttribute("data-closing");
			backdrop.removeAttribute("data-closing");
			el.hidden = true;
			backdrop.hidden = true;
		});
		return;
	}

	body.innerHTML = sheetBody(sheet);
	if (open) return;
	el.removeAttribute("data-closing");
	backdrop.removeAttribute("data-closing");
	el.hidden = false;
	backdrop.hidden = false;
	if (animate) {
		el.setAttribute("data-opening", "");
		backdrop.setAttribute("data-opening", "");
	}
}

function close() {
	if (pushed) history.back();
	else {
		history.replaceState(null, "", BASE);
		sync(true);
	}
}

document.addEventListener("click", (event) => {
	const target = event.target as Element;
	if (target.closest(".poc-close, .poc-backdrop")) {
		close();
		return;
	}
	const anchor = target.closest<HTMLAnchorElement>("a[data-sheet]");
	if (
		!anchor ||
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	)
		return;
	event.preventDefault();
	history.pushState({ poc: true }, "", anchor.getAttribute("href"));
	pushed = true;
	sync(true);
});

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && parseSheet(location.pathname).kind !== "none")
		close();
});

window.addEventListener("popstate", (event) => {
	pushed = Boolean((event.state as { poc?: boolean } | null)?.poc);
	sync(true);
});

drawPage();
sync(false);
