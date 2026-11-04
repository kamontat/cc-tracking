import "@kcstyles/reset.css";
import "../../styles/tokens.css";
import "./poc.css";

/** POC page: a second file served for `/poc/other/<id>` and deeper by a `_redirects` 200 rule. */
const page = document.querySelector<HTMLElement>("#page");
if (page) {
	const tokens = getComputedStyle(document.documentElement)
		.getPropertyValue("--cc-space-4")
		.trim();
	page.innerHTML = `
		<h1>POC: other file</h1>
		<p>Served <code>other.html</code> for <code>${location.pathname}</code>.</p>
		<p>tokens.css loaded: ${tokens ? "yes" : "NO"}</p>
		<p><a href="/poc/items">Back to /poc/items</a></p>`;
}
