import { expect, test } from "bun:test";
import type { Settings } from "#lib/domain/settings";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository } from "#lib/storage/repository";
import { renderSettingsPage } from "./settings";

/** Flushes Lit's microtask-based update chain (page state machine and nested components alike). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

const bannerMessage = (root: HTMLElement): string =>
	root.querySelector("cc-error-banner")?.message ?? "";

/** A repository whose saveSettings always rejects, to exercise the failure path in isolation. */
class RejectingSettingsRepository extends InMemoryRepository {
	override saveSettings(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

test("shows the stored settings", async () => {
	const repo = new InMemoryRepository();
	await repo.saveSettings({ purchaseLocations: ["bangkok"] });
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	const panel = root.querySelector("cc-settings");
	expect(panel?.settings.purchaseLocations).toEqual(["bangkok"]);
});

test("shows Krabi alone before anything has been saved", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	expect(root.querySelector("cc-settings")?.settings.purchaseLocations).toEqual(
		["krabi"],
	);
});

test("stores a change and shows it back", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	root.querySelector("cc-settings")?.dispatchEvent(
		new CustomEvent<Settings>("save-settings", {
			detail: { purchaseLocations: ["krabi", "phichit"] },
		}),
	);
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect(await repo.getSettings()).toEqual({
		purchaseLocations: ["krabi", "phichit"],
	});
	expect(root.querySelector("cc-settings")?.settings.purchaseLocations).toEqual(
		["krabi", "phichit"],
	);
});

test("a failed save leaves a message in the banner and stores nothing", async () => {
	const repo = new RejectingSettingsRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();

	root.querySelector("cc-settings")?.dispatchEvent(
		new CustomEvent<Settings>("save-settings", {
			detail: { purchaseLocations: [] },
		}),
	);
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.getSettings()).toEqual({ purchaseLocations: ["krabi"] });
});

test("renders its heading in the chosen language", async () => {
	setLocale("en");
	const repo = new InMemoryRepository();
	const root = mount();
	renderSettingsPage(repo, root);
	await settle();
	expect(root.textContent).toContain("Settings");

	setLocale("th");
	await settle();
	expect(root.textContent).toContain("ตั้งค่า");
});
