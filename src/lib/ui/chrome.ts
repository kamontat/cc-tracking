import { today } from "#lib/domain/date";
import type { MessageKey } from "#lib/i18n/catalog";
import { getLocale, subscribe, t } from "#lib/i18n/index";
import { type BuildInfo, buildInfo, titleMark } from "#lib/ui/build-info";
import { renderShell } from "#lib/ui/shell";
import { applyTheme } from "#lib/ui/theme";

export type ChromeOptions = {
	root?: ParentNode;
	build?: Pick<BuildInfo, "environment" | "pr">;
	clock?: () => Date;
	path?: string;
};

/**
 * Fills everything around the page's own content -- the document title, the header and the
 * bottom tab bar -- and keeps it in step with the language picker. Also stamps the build on
 * `<html data-env>`, where tokens.css picks up the build's tint, and restores the reader's
 * saved colour theme, since every page passes through here first.
 *
 * The path is read once: these are plain `<a href>` navigations with no client-side router, so
 * it cannot change without a fresh page load. Each locale change re-renders the shell with it,
 * so the current tab stays marked.
 */
export function applyChrome(
	titleKey: MessageKey,
	options: ChromeOptions = {},
): void {
	const root = options.root ?? document;
	const { environment, pr } = options.build ?? buildInfo();
	const clock = options.clock ?? (() => new Date());
	const path = options.path ?? location.pathname;

	const apply = () => {
		document.title = t(titleKey) + titleMark(environment, pr);
		document.documentElement.lang = getLocale();
		document.documentElement.setAttribute("data-env", environment);
		renderShell({ path, today: today(clock()), environment, pr }, root);
	};
	applyTheme();
	apply();
	subscribe(apply);
}
