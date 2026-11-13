<script lang="ts">
	import type { Card, CycleRule, LimitGroup, LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { CardDraft, TextField } from "#lib/ui/card-form"

	import { onMount, untrack } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import { byGroupName } from "#lib/domain/list-view"
	import { formatAmount } from "#lib/domain/money"
	import { DEFAULT_OWNER, groupLabel, OWNERS, type Owner, ownerOf, toOwner } from "#lib/domain/owner"
	import { locationName, sortLocations } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { draftOf, keptIn, readCardDraft } from "#lib/ui/card-form"
	import { LIMITS_ADDRESS } from "#lib/ui/cards-query"

	/**
	 * The card form, the whole of `/card/new` and `/card/edit` under their sub-header, in panels:
	 * *Card* (name; card id, disabled when editing, beside last 4), *Where and who* (*Kept in* as a
	 * segmented control of every stored location, A to Z by shown name; the limit group,
	 * `name (holder) · limit`, required, or with none stored a note to add one from Limits; the cardholder, the group's account holder or a supplementary card
	 * with its own holder), *Billing cycle* (the kind, then the close day beside *due days after
	 * close* or *due on day*) and *Comment*; then the submit. Archive and Delete live on the card
	 * page's More menu, not here.
	 *
	 * Calls `onsave` with the card. `error` is the page's reason a write failed; what was typed
	 * stays, since the fields fill from `card` only when it turns to another card (UI-11).
	 */
	interface Props {
		/** The card to edit; null for a new one. */
		card: Card | null
		groups: LimitGroup[]
		/** The stored locations, every one offered under *Kept in*. */
		locations: LocationRecord[]
		/** Why the page's last write failed, already in the reader's language; typing is kept. */
		error?: string
		/** A write is under way: the submit waits. */
		busy?: boolean
		onsave: (card: Card) => void
	}

	const { card, groups, locations, error = "", busy = false, onsave }: Props = $props()

	const uid = $props.id()
	const headingId = (section: string) => `${uid}-section-${section}`

	const KINDS: readonly CycleRule["kind"][] = ["offset", "fixed"]

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let draft = $state<CardDraft>(draftOf(null))
	/** The catalog key, so a language switch re-renders the message in place. */
	let errorKey = $state<MessageKey | "">("")
	/** The id the fields were last filled from (`null` for a new card); unset before the first fill. */
	let filledFor: string | null | undefined

	/** Fills the fields from `next` only when it turns to another card (by id). */
	const fill = (next: Card | null) => {
		const id = next?.id ?? null
		if (id === filledFor) return
		filledFor = id
		const filled = draftOf(next)
		// A group deleted since the card was saved: the same fallback as a groups change below.
		// With no groups loaded yet the id stays, for when they arrive.
		if (filled.groupId && groups.length > 0 && !groups.some((group) => group.id === filled.groupId)) filled.groupId = ""
		draft = filled
		errorKey = ""
	}

	untrack(() => fill(card))
	$effect.pre(() => {
		const next = card
		untrack(() => fill(next))
	})

	// A group deleted elsewhere while the form is open falls back to the placeholder rather than
	// silently landing on whichever group now sits in its old place.
	$effect.pre(() => {
		const current = groups
		untrack(() => {
			if (draft.groupId && !current.some((group) => group.id === draft.groupId)) draft.groupId = ""
		})
	})

	const sortedGroups = $derived([...groups].sort(byGroupName))

	const places = $derived.by(() => {
		void lang
		return sortLocations(locations)
	})

	const placeName = (record: LocationRecord) => {
		void lang
		return locationName(record)
	}

	const kept = $derived(keptIn(draft.location, locations))

	const holder = $derived.by((): Owner => {
		const group = groups.find(({ id }) => id === draft.groupId)
		return group ? ownerOf(group) : DEFAULT_OWNER
	})

	const typed = (name: TextField) => (event: Event) => {
		draft.text[name] = (event.currentTarget as HTMLInputElement).value
	}

	const picked = (event: Event) => (event.currentTarget as HTMLSelectElement).value

	const onSubmit = (event: Event) => {
		event.preventDefault()
		if (busy) return
		const read = readCardDraft(draft, card, groups, locations)
		if (!read.ok) {
			errorKey = read.key
			return
		}
		errorKey = ""
		onsave(read.card)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<form class="card-form" onsubmit={onSubmit} novalidate>
	<ErrorBanner message={error} />
	{#if errorKey}
		<p role="alert">{tr(errorKey)}</p>
	{/if}

	<section aria-labelledby={headingId("card")}>
		<h2 id={headingId("card")}>{tr("form.section.card")}</h2>
		<article>
			<label>
				{tr("form.name")}
				<input name="name" type="text" value={draft.text.name} autocomplete="off" oninput={typed("name")}>
			</label>
			<div class="pair">
				<label>
					{tr("form.id")}
					<!-- A stored card's id can't change: shown disabled, with no example. -->
					<input
						name="id"
						type="text"
						value={card ? card.id : draft.text.id}
						disabled={card !== null}
						placeholder={card ? undefined : tr("form.idPlaceholder")}
						autocomplete="off"
						oninput={typed("id")}>
				</label>
				<label>
					{tr("form.last4")}
					<input
						name="last4"
						type="text"
						inputmode="numeric"
						value={draft.text.last4}
						autocomplete="off"
						oninput={typed("last4")}>
				</label>
			</div>
		</article>
	</section>

	<section aria-labelledby={headingId("where")}>
		<h2 id={headingId("where")}>{tr("form.section.where")}</h2>
		<article>
			<fieldset>
				<legend>{tr("form.location")}</legend>
				<div class="seg">
					{#each places as record (record.id)}
						<button
							type="button"
							data-location={record.id}
							aria-pressed={record.id === kept ? "true" : "false"}
							onclick={() => {
								draft.location = record.id
							}}>
							{placeName(record)}
						</button>
					{/each}
				</div>
			</fieldset>

			{#if sortedGroups.length === 0}
				<!-- Every card draws on a group (RD-27): with none stored there is nothing to pick. -->
				<p class="no-groups" data-no-groups>
					<span>{tr("form.limitGroup")}</span>
					{tr("form.noGroups")}
					<a href={LIMITS_ADDRESS}>{tr("form.noGroupsAction")}</a>
				</p>
			{:else}
				<label>
					{tr("form.limitGroup")}
					<select
						name="limitGroupId"
						required
						value={draft.groupId}
						onchange={(event) => {
							draft.groupId = picked(event)
						}}>
						<!-- Shown until a group is picked, never picked back (RD-27). -->
						<option value="" disabled>{tr("form.limitGroupNone")}</option>
						{#each sortedGroups as group (group.id)}
							<option value={group.id}>{groupLabel(group)} · {formatAmount(group.limit)}</option>
						{/each}
					</select>
				</label>
			{/if}

			<div class="field">
				<label>
					{tr("form.holder")}
					<select
						name="holder"
						value={draft.supplementary ? "supplementary" : "account"}
						onchange={(event) => {
							draft.supplementary = picked(event) === "supplementary"
						}}>
						<option value="account">{tr("form.holderAccount", { owner: holder })}</option>
						<option value="supplementary">{tr("form.supplementary")}</option>
					</select>
				</label>
				{#if draft.supplementary}
					<label>
						{tr("form.owner")}
						<select
							name="owner"
							value={draft.owner}
							onchange={(event) => {
								draft.owner = toOwner(picked(event)) ?? ""
							}}>
							<option value="">{tr("form.ownerNone")}</option>
							{#each OWNERS as value (value)}
								<option {value}>{value}</option>
							{/each}
						</select>
					</label>
				{/if}
			</div>
		</article>
	</section>

	<section aria-labelledby={headingId("cycle")}>
		<h2 id={headingId("cycle")}>{tr("form.cycle")}</h2>
		<article>
			<!-- A fieldset named by the section's heading, without a fieldset's frame. -->
			<fieldset class="kinds" aria-labelledby={headingId("cycle")}>
				<div class="seg">
					{#each KINDS as kind (kind)}
						<button
							type="button"
							data-kind={kind}
							aria-pressed={kind === draft.kind ? "true" : "false"}
							onclick={() => {
								draft.kind = kind
							}}>
							{tr(kind === "offset" ? "form.cycleOffset" : "form.cycleFixed")}
						</button>
					{/each}
				</div>
			</fieldset>
			<div class="pair">
				<label>
					{tr("form.closeDay")}
					<input
						name="closeDay"
						type="number"
						inputmode="numeric"
						min="1"
						max="31"
						value={draft.text.closeDay}
						autocomplete="off"
						oninput={typed("closeDay")}>
				</label>
				{#if draft.kind === "offset"}
					<label>
						{tr("form.dueOffsetDays")}
						<input
							name="dueOffsetDays"
							type="number"
							inputmode="numeric"
							min="1"
							max="60"
							value={draft.text.dueOffsetDays}
							autocomplete="off"
							oninput={typed("dueOffsetDays")}>
					</label>
				{:else}
					<label>
						{tr("form.dueDay")}
						<input
							name="dueDay"
							type="number"
							inputmode="numeric"
							min="1"
							max="31"
							value={draft.text.dueDay}
							autocomplete="off"
							oninput={typed("dueDay")}>
					</label>
				{/if}
			</div>
		</article>
	</section>

	<section aria-labelledby={headingId("comment")}>
		<h2 id={headingId("comment")}>{tr("form.comment")}</h2>
		<article>
			<input
				name="comment"
				type="text"
				value={draft.text.comment}
				aria-labelledby={headingId("comment")}
				autocomplete="off"
				oninput={typed("comment")}>
		</article>
	</section>

	<div class="actions">
		<button type="submit" disabled={busy}>{card ? tr("form.save") : tr("form.add")}</button>
	</div>
</form>

<!--
	The legacy shadow styles (`base`, `controls`, `panel` and the form's own), scoped. Every rule
	starts at `.card-form`, so it outranks app.css's `.page button`, `.page input`, `.page label`
	and `.page h2`.
-->
<style>
	.card-form {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
	}

	.card-form section {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-2);
	}

	/* A section's name: small and muted over its panel, like the prototype's labels. */
	.card-form h2 {
		margin: 0;
		font-size: var(--cc-text-xs);
		font-weight: 650;
		color: var(--cc-text-muted);
		text-transform: uppercase;
		letter-spacing: var(--cc-tracking-caps);
	}

	.card-form article {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		padding: var(--cc-space-4) var(--cc-panel-padding) var(--cc-panel-padding);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
		box-shadow: var(--cc-shadow-sm);
	}

	.card-form p[role="alert"] {
		margin: 0;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
		border-radius: var(--cc-radius-sm);
	}

	.card-form label {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.card-form .no-groups {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		margin: 0;
		font-size: var(--cc-text-sm);
		color: var(--cc-text);
	}

	.card-form .no-groups > span {
		color: var(--cc-text-muted);
	}

	.card-form .pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--cc-space-3);
		align-items: start;
	}

	/* The cardholder, with a supplementary card's own holder under it. */
	.card-form .field {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	.card-form fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		min-inline-size: 0;
		padding: 0;
		margin: 0;
		border: 0;
	}

	.card-form legend {
		padding: 0;
		margin-bottom: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		font-weight: inherit;
		color: var(--cc-text-muted);
		text-transform: none;
		letter-spacing: normal;
	}

	.card-form input,
	.card-form select {
		width: 100%;
		min-inline-size: 0;
		padding: var(--cc-space-3);
		font: inherit;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	/* Drop the UA's own arrow and paint one, so a select's right inset is a token like every
	   other control's; the padding leaves the chevron a matching gutter on both sides. */
	.card-form select {
		appearance: none;
		-webkit-appearance: none;
		padding-right: calc(var(--cc-space-3) * 2 + var(--cc-select-chevron-size));
		background-image: var(--cc-select-chevron);
		background-repeat: no-repeat;
		background-position: right var(--cc-space-3) center;
		background-size: var(--cc-select-chevron-size);
	}

	.card-form input:disabled {
		color: var(--cc-text-muted);
		background: var(--cc-surface-sunken);
	}

	.card-form button {
		align-self: flex-start;
		padding: var(--cc-space-2) var(--cc-space-3);
		font: inherit;
		font-size: var(--cc-text-sm);
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--cc-accent-text);
		cursor: pointer;
		background: var(--cc-accent);
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-sm);
	}

	.card-form button:hover {
		background: var(--cc-accent-hover);
	}

	.card-form button:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.card-form :focus-visible {
		outline: none;
		box-shadow: var(--cc-focus-ring);
	}

	.card-form .seg {
		display: grid;
		grid-auto-columns: minmax(0, 1fr);
		grid-auto-flow: column;
		gap: var(--cc-space-1);
		padding: var(--cc-space-1);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.card-form .seg button {
		align-self: stretch;
		white-space: normal;
		color: var(--cc-text);
		background: transparent;
		border-color: transparent;
	}

	.card-form .seg button[aria-pressed="true"] {
		font-weight: 650;
		color: var(--cc-success);
		background: var(--cc-surface);
		border-color: var(--cc-border);
	}

	.card-form .actions {
		display: flex;
		flex-direction: column;
	}

	.card-form .actions > button {
		align-self: stretch;
		padding: var(--cc-space-3) var(--cc-space-4);
		font-size: var(--cc-text-md);
		font-weight: 650;
	}
</style>
