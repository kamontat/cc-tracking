<script lang="ts">
	import type { Card, LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { NameProblem } from "#lib/ui/location-names"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, tick } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import { canDeleteLocation, locationId, renameLocation } from "#lib/domain/locations"
	import { locationName, sortLocations } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { nameProblem, problemText } from "#lib/ui/location-names"
	import { createPageState } from "#lib/ui/page-state"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The Locations panel's body (`/settings?panel=locations`, RD-17): one block per location record,
	 * A to Z by shown name, with its card count (archived cards too), *Rename*, *Delete* while no
	 * card is kept there and it is not the last record, and *Takes purchases*. Then a warning
	 * when nowhere takes purchases, and *Add a location*, whose id comes from `locationId` and
	 * which takes purchases off. Everything here is the reader's data, so it renders in the
	 * browser (PRD DD-172); app.css draws it, the same markup the legacy route drew.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** A write went through, so Settings can sum the records up again. */
		onchange?: () => void
	}

	const { open = () => openRepository(), onchange }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let repo: Repository | null = null
	let locations = $state<LocationRecord[]>([])
	let cards = $state<Card[]>([])
	/** The record whose name is being edited, what is typed, and why a save was refused. */
	let renaming = $state<{ id: string; text: string; problem: NameProblem | null } | null>(null)
	/** The record whose *Delete* asks for a second click. */
	let deleting = $state<string | null>(null)
	let addText = $state("")
	let addProblem = $state<NameProblem | null>(null)
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	/** Bumped after every load, so the banner re-reads the page state's error. */
	let painted = $state(0)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			;[locations, cards] = await Promise.all([repo.listLocations(), repo.listCards()])
		},
		fallbackKey: "locations.error.read",
		paint: () => {
			painted++
		},
	})

	const bannerMessage = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	const sorted = $derived.by(() => {
		void lang
		return sortLocations(locations)
	})

	const noneTake = $derived(locations.length > 0 && !locations.some((record) => record.takesPurchases))

	/** Runs a write through the page state's guard; true when it went through. */
	const write = async (
		action: (repo: Repository) => Promise<void>,
		messageKey: "locations.error.save" | "locations.error.delete",
	): Promise<boolean> => {
		const store = repo
		if (!store) return false
		let done = false
		await page.guard(async () => {
			await action(store)
			done = true
		}, messageKey)
		if (done) onchange?.()
		return done
	}

	const countAt = (id: string) => cards.filter((card) => card.location === id).length

	/** Why a name was refused, following a language switch. */
	const why = (problem: NameProblem) => {
		void lang
		return problemText(problem)
	}

	const nameOf = (record: LocationRecord) => {
		void lang
		return locationName(record)
	}

	const onRename = (record: LocationRecord) => {
		renaming = { id: record.id, text: locationName(record), problem: null }
		deleting = null
	}

	const onCancelName = () => {
		renaming = null
	}

	const onSaveName = async () => {
		if (!renaming) return
		const { id, text } = renaming
		const problem = nameProblem(text, locations, id)
		if (problem) {
			renaming = { ...renaming, problem }
			return
		}
		const current = locations.find((record) => record.id === id)
		const next = renameLocation(locations, id, text.trim()).find((record) => record.id === id)
		// Unchanged: a default saved under its Thai name would stop following the language.
		const unchanged = !current || !next || text.trim() === locationName(current)
		// The field stays open with what was typed until the write goes through.
		if (unchanged || (await write((store) => store.saveLocation(next), "locations.error.save"))) renaming = null
	}

	const onNameKey = (event: KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault()
			void onSaveName()
		} else if (event.key === "Escape") onCancelName()
	}

	/** Focuses the button `action` on record `id`'s row once the swap has drawn (UI-09). */
	const focusOn = async (id: string, action: string) => {
		await tick()
		document
			.querySelector<HTMLElement>(`.record-row[data-location="${CSS.escape(id)}"] [data-action="${action}"]`)
			?.focus()
	}

	/** *Delete* swaps in place for the asking *Delete* and *Cancel*, focus following. */
	const onDelete = (id: string) => {
		deleting = id
		renaming = null
		void focusOn(id, "confirm-delete")
	}

	const onCancelDelete = (id: string) => {
		deleting = null
		void focusOn(id, "delete")
	}

	/** The question stays open until the delete goes through. */
	const onConfirmDelete = async (id: string) => {
		if (await write((store) => store.deleteLocation(id), "locations.error.delete")) deleting = null
	}

	const onTakes = (record: LocationRecord, event: Event) => {
		const takesPurchases = (event.currentTarget as HTMLInputElement).checked
		return write((store) => store.saveLocation({ ...record, takesPurchases }), "locations.error.save")
	}

	const onAdd = async (event: Event) => {
		event.preventDefault()
		addProblem = nameProblem(addText, locations)
		if (addProblem) return
		const name = addText.trim()
		const record: LocationRecord = { id: locationId(name, locations), name, takesPurchases: false }
		// The typed name stays in the field until the write goes through.
		if (await write((store) => store.saveLocation(record), "locations.error.save")) addText = ""
	}

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		void (async () => {
			const opened = await open()
			if (!opened.ok) {
				startupFailure = opened.message
				return
			}
			repo = opened.repo
			await page.load()
		})()
		return unsubscribe
	})
</script>

<ErrorBanner message={bannerMessage} retryLabel={tr("common.reload")} onretry={onRetry} />
{#if !startupFailure}
	<div class="records">
		<p class="set-note">{tr("locations.deleteNote")}</p>
		{#if sorted.length > 0}
			<div class="set">
				{#each sorted as record (record.id)}
					{@const name = nameOf(record)}
					{@const count = countAt(record.id)}
					<div class="record-row" data-location={record.id}>
						{#if renaming?.id === record.id}
							{@const errorId = `record-error-${record.id}`}
							<div class="record-row__line">
								<input
									class="record-row__field"
									value={renaming.text}
									oninput={(event) => {
										if (renaming) renaming.text = event.currentTarget.value
									}}
									aria-label={tr("locations.renameLabel", { name })}
									aria-invalid={renaming.problem ? "true" : "false"}
									aria-describedby={renaming.problem ? errorId : undefined}
									onkeydown={onNameKey}>
								<button type="button" data-action="save-name" onclick={onSaveName}>{tr("locations.save")}</button>
								<button type="button" data-variant="quiet" data-action="cancel-name" onclick={onCancelName}>
									{tr("common.cancel")}
								</button>
							</div>
							{#if renaming.problem}
								<p class="record-error" id={errorId} role="alert">{why(renaming.problem)}</p>
							{/if}
						{:else}
							<div class="record-row__line">
								<span class="record-row__text">
									<strong>{name}</strong>
									<small>{count === 1 ? tr("cards.page.count.one") : tr("cards.page.count.many", { count })}</small>
								</span>
								{#if deleting === record.id}
									<button
										type="button"
										data-variant="danger"
										data-action="confirm-delete"
										aria-label={tr("locations.deleteAsk", { name })}
										onclick={() => onConfirmDelete(record.id)}>
										{tr("common.delete")}
									</button>
									<button
										type="button"
										data-variant="quiet"
										data-action="cancel-delete"
										onclick={() => onCancelDelete(record.id)}>
										{tr("common.cancel")}
									</button>
								{:else}
									<button type="button" data-variant="quiet" data-action="rename" onclick={() => onRename(record)}>
										{tr("locations.rename")}
									</button>
									{#if locations.length > 1 && canDeleteLocation(record.id, cards)}
										<button
											type="button"
											data-variant="danger"
											data-action="delete"
											onclick={() => onDelete(record.id)}>
											{tr("common.delete")}
										</button>
									{/if}
								{/if}
							</div>
						{/if}
						<label class="record-row__takes">
							<input
								type="checkbox"
								data-action="takes-purchases"
								checked={record.takesPurchases}
								onchange={(event) => onTakes(record, event)}>
							<span>{tr("locations.takes")}</span>
						</label>
					</div>
				{/each}
			</div>
		{/if}
		{#if noneTake}
			<p class="record-warning" role="status">{tr("locations.noneTake")}</p>
		{/if}
		<form class="record-add" data-action="add-location" onsubmit={onAdd}>
			<label>
				{tr("locations.add")}
				<span class="record-add__control">
					<input
						name="name"
						bind:value={addText}
						placeholder={tr("locations.addPlaceholder")}
						aria-invalid={addProblem ? "true" : "false"}
						aria-describedby={addProblem ? "record-add-error" : undefined}>
					<button type="submit">{tr("locations.addAction")}</button>
				</span>
			</label>
			{#if addProblem}
				<p class="record-error" id="record-add-error" role="alert">{why(addProblem)}</p>
			{/if}
		</form>
	</div>
{/if}
