import "#components/cc-error-banner";
import { html, nothing, render } from "lit";
import { live } from "lit/directives/live.js";
import {
	canDeleteLocation,
	locationId,
	renameLocation,
} from "#lib/domain/locations";
import type { Card, LocationRecord } from "#lib/domain/types";
import { en } from "#lib/i18n/en";
import { locationName, sortLocations } from "#lib/i18n/format";
import { subscribe, t } from "#lib/i18n/index";
import { th } from "#lib/i18n/th";
import type { Repository } from "#lib/storage/repository";
import { createPageState } from "#lib/ui/page-state";
import { subHeader } from "#lib/ui/sub-header";

/** Why a typed name is refused: none at all, or one another location already shows or stores. */
type NameProblem = { kind: "empty" } | { kind: "duplicate"; name: string };

/** How names compare: trimmed, case-insensitive. */
const key = (name: string) => name.trim().toLocaleLowerCase();

/**
 * Every name `record` goes by: its stored name, its shown name, and -- for a seeded place
 * still under its English default -- its catalog name in both languages, so the check does
 * not depend on which language the reader has on.
 */
function namesOf(record: LocationRecord): string[] {
	const names = [record.name, locationName(record)];
	const catalogKey = `location.${record.id}`;
	if (catalogKey in en) {
		const key = catalogKey as keyof typeof en;
		if (record.name === en[key]) names.push(th[key]);
	}
	return names;
}

/**
 * Checks `typed` against every record but `self`: refused when empty, or when it matches any
 * name the record goes by (`namesOf`), trimmed and case-insensitive.
 */
export function nameProblem(
	typed: string,
	records: LocationRecord[],
	self?: string,
): NameProblem | null {
	const wanted = key(typed);
	if (!wanted) return { kind: "empty" };
	const taken = records.some(
		(record) =>
			record.id !== self &&
			namesOf(record).some((name) => key(name) === wanted),
	);
	return taken ? { kind: "duplicate", name: typed.trim() } : null;
}

const problemText = (problem: NameProblem) =>
	problem.kind === "empty"
		? t("locations.error.empty")
		: t("locations.error.duplicate", { name: problem.name });

/**
 * The Locations page (`/settings/locations`, RD-17) under a compact sub-header back to
 * Settings: one block per location record, A to Z by shown name, with its card count
 * (archived cards too), *Rename*, *Delete* while no card is kept there and it is not the last
 * record, and *Takes purchases*. Then a warning when nowhere takes purchases, and *Add a
 * location*, whose id comes from `locationId` and which takes purchases off.
 */
export function renderLocationsPage(repo: Repository, root: HTMLElement): void {
	let locations: LocationRecord[] = [];
	let cards: Card[] = [];
	/** The record whose name is being edited, what is typed, and why a save was refused. */
	let renaming: {
		id: string;
		text: string;
		problem: NameProblem | null;
	} | null = null;
	/** The record whose *Delete* asks for a second click. */
	let deleting: string | null = null;
	let addText = "";
	let addProblem: NameProblem | null = null;

	const state = createPageState({
		fetch: async () => {
			[locations, cards] = await Promise.all([
				repo.listLocations(),
				repo.listCards(),
			]);
		},
		fallbackKey: "locations.error.read",
		paint: () => paint(),
	});

	/** Runs a write through `state.guard`; true when it went through. */
	const write = async (
		action: () => Promise<void>,
		messageKey: "locations.error.save" | "locations.error.delete",
	): Promise<boolean> => {
		let done = false;
		await state.guard(async () => {
			await action();
			done = true;
		}, messageKey);
		return done;
	};

	const countAt = (id: string) =>
		cards.filter((card) => card.location === id).length;

	const onRename = (record: LocationRecord) => () => {
		renaming = { id: record.id, text: locationName(record), problem: null };
		deleting = null;
		paint();
	};

	const onCancelName = () => {
		renaming = null;
		paint();
	};

	const onSaveName = async () => {
		if (!renaming) return;
		const { id, text } = renaming;
		const problem = nameProblem(text, locations, id);
		if (problem) {
			renaming = { ...renaming, problem };
			paint();
			return;
		}
		const current = locations.find((record) => record.id === id);
		const next = renameLocation(locations, id, text.trim()).find(
			(record) => record.id === id,
		);
		// Unchanged: a default saved under its Thai name would stop following the language.
		const unchanged =
			!current || !next || text.trim() === locationName(current);
		// The field stays open with what was typed until the write goes through.
		if (
			unchanged ||
			(await write(() => repo.saveLocation(next), "locations.error.save"))
		)
			renaming = null;
		paint();
	};

	const onNameKey = (event: KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			void onSaveName();
		} else if (event.key === "Escape") onCancelName();
	};

	const onDelete = (id: string) => () => {
		deleting = id;
		renaming = null;
		paint();
	};

	const onCancelDelete = () => {
		deleting = null;
		paint();
	};

	/** The question stays open until the delete goes through. */
	const onConfirmDelete = (id: string) => async () => {
		if (await write(() => repo.deleteLocation(id), "locations.error.delete"))
			deleting = null;
		paint();
	};

	const onTakes = (record: LocationRecord) => (event: Event) => {
		const takesPurchases = (event.target as HTMLInputElement).checked;
		return write(
			() => repo.saveLocation({ ...record, takesPurchases }),
			"locations.error.save",
		);
	};

	const onAdd = async (event: Event) => {
		event.preventDefault();
		addProblem = nameProblem(addText, locations);
		if (addProblem) return paint();
		const name = addText.trim();
		const record: LocationRecord = {
			id: locationId(name, locations),
			name,
			takesPurchases: false,
		};
		// The typed name stays in the field until the write goes through.
		if (await write(() => repo.saveLocation(record), "locations.error.save"))
			addText = "";
		paint();
	};

	/** Line 1 of a block: its name and count with *Rename* and *Delete*, or one of their steps. */
	const firstLine = (record: LocationRecord, name: string) => {
		const count = countAt(record.id);
		if (renaming?.id === record.id) {
			const problem = renaming.problem;
			const errorId = `location-error-${record.id}`;
			return html`<div class="location-row__line">
					<input
						class="location-row__field"
						.value=${live(renaming.text)}
						aria-label=${t("locations.renameLabel", { name })}
						aria-invalid=${problem ? "true" : "false"}
						aria-describedby=${problem ? errorId : nothing}
						@input=${(event: Event) => {
							if (renaming)
								renaming.text = (event.target as HTMLInputElement).value;
						}}
						@keydown=${onNameKey}
					/>
					<button type="button" data-action="save-name" @click=${onSaveName}>${t("locations.save")}</button>
					<button type="button" data-variant="quiet" data-action="cancel-name" @click=${onCancelName}>${t("common.cancel")}</button>
				</div>
				${
					problem
						? html`<p class="location-error" id=${errorId} role="alert">${problemText(problem)}</p>`
						: nothing
				}`;
		}
		if (deleting === record.id) {
			return html`<div class="set-ask">
				<p class="set-ask__note">${t("locations.deleteAsk", { name })}</p>
				<div class="set-ask__actions">
					<button type="button" data-variant="quiet" data-action="cancel-delete" @click=${onCancelDelete}>${t("common.cancel")}</button>
					<button type="button" data-variant="danger" data-action="confirm-delete" @click=${onConfirmDelete(record.id)}>${t("common.delete")}</button>
				</div>
			</div>`;
		}
		const deletable =
			locations.length > 1 && canDeleteLocation(record.id, cards);
		return html`<div class="location-row__line">
			<span class="location-row__text">
				<strong>${name}</strong>
				<small>${
					count === 1
						? t("cards.page.count.one")
						: t("cards.page.count.many", { count })
				}</small>
			</span>
			<button type="button" data-variant="quiet" data-action="rename" @click=${onRename(record)}>${t("locations.rename")}</button>
			${
				deletable
					? html`<button type="button" data-variant="danger" data-action="delete" @click=${onDelete(record.id)}>${t("common.delete")}</button>`
					: nothing
			}
		</div>`;
	};

	const block = (record: LocationRecord) => {
		const name = locationName(record);
		return html`<div class="location-row" data-location=${record.id}>
			${firstLine(record, name)}
			<label class="location-row__takes">
				<input
					type="checkbox"
					data-action="takes-purchases"
					.checked=${record.takesPurchases}
					@change=${onTakes(record)}
				/>
				<span>${t("locations.takes")} <small>${t("locations.takesHint")}</small></span>
			</label>
		</div>`;
	};

	const paint = () => {
		const sorted = sortLocations(locations);
		render(
			html`${subHeader({ title: t("settings.locations.title"), back: "/settings" })}
				<cc-error-banner .message=${state.error}
					retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<div class="locations">
					${
						sorted.length > 0
							? html`<div class="set">${sorted.map(block)}</div>`
							: nothing
					}
					${
						locations.length > 0 &&
						!locations.some((record) => record.takesPurchases)
							? html`<p class="location-warning" role="status">${t("locations.noneTake")}</p>`
							: nothing
					}
					<p class="set-note">${t("locations.deleteNote")}</p>
					<form class="location-add" data-action="add-location" @submit=${onAdd}>
						<label>
							${t("locations.add")}
							<span class="location-add__control">
								<input
									name="name"
									.value=${live(addText)}
									placeholder=${t("locations.addPlaceholder")}
									aria-invalid=${addProblem ? "true" : "false"}
									aria-describedby=${addProblem ? "location-add-error" : nothing}
									@input=${(event: Event) => {
										addText = (event.target as HTMLInputElement).value;
									}}
								/>
								<button type="submit">${t("locations.addAction")}</button>
							</span>
						</label>
						${
							addProblem
								? html`<p class="location-error" id="location-add-error" role="alert">${problemText(addProblem)}</p>`
								: nothing
						}
					</form>
				</div>`,
			root,
		);
	};

	subscribe(() => paint());
	void state.load();
}
