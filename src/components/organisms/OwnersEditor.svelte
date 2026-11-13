<script lang="ts">
	import type { Card, LimitGroup, OwnerRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { NameProblem } from "#lib/ui/location-names"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import { canDeleteOwner, ownerId, ownerOf, renameOwner, sortOwners } from "#lib/domain/owner"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { ownerNameProblem, ownerProblemText } from "#lib/ui/owner-names"
	import { createPageState } from "#lib/ui/page-state"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The Owners page's island (`/settings/owners`, RD-30): one block per owner record, A to Z by
	 * name, with how many limit groups and supplementary cards (archived too) it holds, *Rename*,
	 * and *Delete* while nothing names it and it is not the last record. Then *Add an owner*,
	 * whose id comes from `ownerId`. The markup is the Locations page's (`.record-row`), so
	 * app.css draws both alike.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
	}

	const { open = () => openRepository() }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let repo: Repository | null = null
	let owners = $state<OwnerRecord[]>([])
	let groups = $state<LimitGroup[]>([])
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
			;[owners, groups, cards] = await Promise.all([repo.listOwners(), repo.listLimitGroups(), repo.listCards()])
		},
		fallbackKey: "owners.error.read",
		paint: () => {
			painted++
		},
	})

	const bannerMessage = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	const sorted = $derived(sortOwners(owners))

	/** Runs a write through the page state's guard; true when it went through. */
	const write = async (
		action: (repo: Repository) => Promise<void>,
		messageKey: "owners.error.save" | "owners.error.delete",
	): Promise<boolean> => {
		const store = repo
		if (!store) return false
		let done = false
		await page.guard(async () => {
			await action(store)
			done = true
		}, messageKey)
		return done
	}

	/** What the owner holds: its limit groups, then its supplementary cards when it has any. */
	const holds = (id: string): string => {
		void lang
		const groupCount = groups.filter((group) => ownerOf(group) === id).length
		const subCount = cards.filter((card) => card.supplementary && card.owner === id).length
		const parts = [t(groupCount === 1 ? "owners.groups.one" : "owners.groups.many", { count: groupCount })]
		if (subCount > 0) parts.push(t(subCount === 1 ? "owners.subs.one" : "owners.subs.many", { count: subCount }))
		return parts.join(" · ")
	}

	/** Why a name was refused, following a language switch. */
	const why = (problem: NameProblem) => {
		void lang
		return ownerProblemText(problem)
	}

	const onRename = (record: OwnerRecord) => {
		renaming = { id: record.id, text: record.name, problem: null }
		deleting = null
	}

	const onCancelName = () => {
		renaming = null
	}

	const onSaveName = async () => {
		if (!renaming) return
		const { id, text } = renaming
		const problem = ownerNameProblem(text, owners, id)
		if (problem) {
			renaming = { ...renaming, problem }
			return
		}
		const current = owners.find((record) => record.id === id)
		const next = renameOwner(owners, id, text.trim()).find((record) => record.id === id)
		const unchanged = !current || !next || next.name === current.name
		// The field stays open with what was typed until the write goes through.
		if (unchanged || (await write((store) => store.saveOwner(next), "owners.error.save"))) renaming = null
	}

	const onNameKey = (event: KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault()
			void onSaveName()
		} else if (event.key === "Escape") onCancelName()
	}

	const onDelete = (id: string) => {
		deleting = id
		renaming = null
	}

	/** The question stays open until the delete goes through. */
	const onConfirmDelete = async (id: string) => {
		if (await write((store) => store.deleteOwner(id), "owners.error.delete")) deleting = null
	}

	const onAdd = async (event: Event) => {
		event.preventDefault()
		addProblem = ownerNameProblem(addText, owners)
		if (addProblem) return
		const name = addText.trim()
		const record: OwnerRecord = { id: ownerId(name, owners), name }
		// The typed name stays in the field until the write goes through.
		if (await write((store) => store.saveOwner(record), "owners.error.save")) addText = ""
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
		{#if sorted.length > 0}
			<div class="set">
				{#each sorted as record (record.id)}
					<div class="record-row" data-owner={record.id}>
						{#if renaming?.id === record.id}
							{@const errorId = `owner-error-${record.id}`}
							<div class="record-row__line">
								<input
									class="record-row__field"
									value={renaming.text}
									oninput={(event) => {
										if (renaming) renaming.text = event.currentTarget.value
									}}
									aria-label={tr("owners.renameLabel", { name: record.name })}
									aria-invalid={renaming.problem ? "true" : "false"}
									aria-describedby={renaming.problem ? errorId : undefined}
									onkeydown={onNameKey}>
								<button type="button" data-action="save-name" onclick={onSaveName}>{tr("owners.save")}</button>
								<button type="button" data-variant="quiet" data-action="cancel-name" onclick={onCancelName}>
									{tr("common.cancel")}
								</button>
							</div>
							{#if renaming.problem}
								<p class="record-error" id={errorId} role="alert">{why(renaming.problem)}</p>
							{/if}
						{:else if deleting === record.id}
							<div class="set-ask">
								<p class="set-ask__note">{tr("owners.deleteAsk", { name: record.name })}</p>
								<div class="set-ask__actions">
									<button
										type="button"
										data-variant="quiet"
										data-action="cancel-delete"
										onclick={() => {
											deleting = null
										}}>
										{tr("common.cancel")}
									</button>
									<button
										type="button"
										data-variant="danger"
										data-action="confirm-delete"
										onclick={() => onConfirmDelete(record.id)}>
										{tr("common.delete")}
									</button>
								</div>
							</div>
						{:else}
							<div class="record-row__line">
								<span class="record-row__text">
									<strong>{record.name}</strong>
									<small>{holds(record.id)}</small>
								</span>
								<button type="button" data-variant="quiet" data-action="rename" onclick={() => onRename(record)}>
									{tr("owners.rename")}
								</button>
								{#if owners.length > 1 && canDeleteOwner(record.id, groups, cards)}
									<button type="button" data-variant="danger" data-action="delete" onclick={() => onDelete(record.id)}>
										{tr("common.delete")}
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
		<p class="set-note">{tr("owners.deleteNote")}</p>
		<form class="record-add" data-action="add-owner" onsubmit={onAdd}>
			<label>
				{tr("owners.add")}
				<span class="record-add__control">
					<input
						name="name"
						bind:value={addText}
						placeholder={tr("owners.addPlaceholder")}
						aria-invalid={addProblem ? "true" : "false"}
						aria-describedby={addProblem ? "owner-add-error" : undefined}>
					<button type="submit">{tr("owners.addAction")}</button>
				</span>
			</label>
			{#if addProblem}
				<p class="record-error" id="owner-add-error" role="alert">{why(addProblem)}</p>
			{/if}
		</form>
	</div>
{/if}
