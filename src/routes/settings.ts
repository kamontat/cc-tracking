import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import "#components/cc-settings";
import { html, render } from "lit";
import { DEFAULT_SETTINGS, type Settings } from "#lib/domain/settings";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

/** Renders the settings page into `root`, wiring it to `repo`. Exported for tests. */
export function renderSettingsPage(repo: Repository, root: HTMLElement): void {
	let settings: Settings = DEFAULT_SETTINGS;

	const state = createPageState({
		fetch: async () => {
			settings = await repo.getSettings();
		},
		fallbackKey: "settings.error.read",
		paint: () => paint(),
	});

	const onSave = (event: CustomEvent<Settings>) =>
		state.guard(() => repo.saveSettings(event.detail), "settings.error.save");

	const paint = () =>
		render(
			html`
				<h1>${t("settings.title")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<article>
					<cc-settings .settings=${settings} @save-settings=${onSave}></cc-settings>
				</article>
			`,
			root,
		);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.settings", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderSettingsPage(repo, root);
});
