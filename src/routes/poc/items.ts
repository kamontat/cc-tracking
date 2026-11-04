import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "./poc.css";
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

function render(animate: boolean) {
	if (!page) return;
	const sheet = parseSheet(location.pathname);
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
		${diagnostics()}
		<div class="poc-backdrop" ${sheet.kind === "none" ? "hidden" : ""}></div>
		<section class="poc-sheet" role="dialog" aria-modal="true"
			${sheet.kind === "none" ? "hidden" : ""} ${animate ? "data-animate" : ""}>
			<button type="button" class="poc-close">Close</button>
			${sheetBody(sheet)}
		</section>`;
}

function close() {
	if (pushed) history.back();
	else {
		history.replaceState(null, "", BASE);
		render(false);
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
	render(true);
});

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && parseSheet(location.pathname).kind !== "none")
		close();
});

window.addEventListener("popstate", (event) => {
	pushed = Boolean((event.state as { poc?: boolean } | null)?.poc);
	render(true);
});

render(false);
