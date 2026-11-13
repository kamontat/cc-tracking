<script lang="ts">
	import type { LimitGroup } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount, tick, untrack } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import Sheet from "#components/molecules/Sheet.svelte"
	import { GROUP_COLORS, type GroupColor, pickColor, toGroupColor } from "#lib/domain/group-color"
	import { amountOf, formatAmountInput } from "#lib/domain/money"
	import { OWNERS, type Owner, ownerOf } from "#lib/domain/owner"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * A limit group in a sheet over Cards: name, limit and account holder (a segmented control),
	 * a colour, then *Save*. An existing group no card uses also has *Delete group*, which swaps in
	 * place for *Delete NAME?* with *Delete* and *Keep* (UI-09); focus follows the swap. *Save*
	 * calls `onsave` with the group and *Delete* `ondelete`, both at once, the sheet staying up
	 * until the page takes it away; Close, Escape and the backdrop call `onclose` once the exit has
	 * played. `error` says why a save or delete failed; what was typed stays.
	 */
	interface Props {
		/** The group to edit; null for a new one. */
		group: LimitGroup | null
		/** Every stored group; the sheet leaves its own out when judging which colours are free. */
		groups: LimitGroup[]
		/** A card uses the group, so it cannot be deleted. */
		inUse: boolean
		/** Why the last save or delete failed, already in the reader's language; typing is kept. */
		error: string
		/** A save or delete is under way: the buttons wait and the sheet holds open. */
		busy: boolean
		/** The draw behind a random colour; tests inject it. */
		random?: () => number
		onsave: (group: LimitGroup) => void
		ondelete: (group: LimitGroup) => void
		onclose: () => void
	}

	const { group, groups, inUse, error, busy, random = Math.random, onsave, ondelete, onclose }: Props = $props()

	const uid = $props.id()
	const ownerLegend = `${uid}-owner`
	const colorLegend = `${uid}-color`

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let form: HTMLFormElement | undefined = $state()
	let name = $state("")
	let limit = $state("")
	let owner = $state<Owner | null>(null)
	let color = $state<GroupColor>(GROUP_COLORS[0])
	let asking = $state(false)
	/** The catalog key, so a language switch re-renders the message in place. */
	let errorKey = $state<MessageKey | "">("")
	/** The id the fields were last filled from (`null` for a new group); unset before the first fill. */
	let filledFor: string | null | undefined

	/**
	 * A random colour none of the other groups wear. `avoid` is a colour to leave out too, so
	 * Random never lands on the one already chosen; `pickColor` falls back to it only when
	 * nothing else is free.
	 */
	const freeColor = (avoid?: GroupColor): GroupColor => {
		const id = group?.id
		const others = groups.filter((g) => g.id !== id)
		const picked = pickColor(others, random)
		if (!avoid || picked !== avoid) return picked
		// Drew the chosen colour: draw again with it counted as taken. When it was the only
		// free colour that draw falls back to the whole palette, so keep the first draw then.
		const used = new Set(others.map((g) => g.color))
		const free = GROUP_COLORS.filter((c) => !used.has(c))
		if (free.length < 2) return picked
		return pickColor([...others, { color: avoid } as LimitGroup], random)
	}

	/**
	 * Fills the fields from the group only when the sheet turns to another group (by id), so a
	 * page that hands back a fresh copy of the same group -- a reload after a failed save --
	 * keeps what was typed (UI-11).
	 */
	const fill = (next: LimitGroup | null) => {
		const id = next?.id ?? null
		if (id === filledFor) return
		filledFor = id
		name = next?.name ?? ""
		limit = next ? formatAmountInput(next.limit) : ""
		owner = next ? ownerOf(next) : null
		color = toGroupColor(next?.color) ?? freeColor()
		asking = false
		errorKey = ""
	}

	untrack(() => fill(group))
	$effect.pre(() => {
		const next = group
		untrack(() => fill(next))
	})

	/** Focuses the form's first element matching `selector` once the change has rendered. */
	const focusAfter = async (selector: string) => {
		await tick()
		form?.querySelector<HTMLElement>(selector)?.focus()
	}

	const swap = (ask: boolean, focus: string) => {
		asking = ask
		void focusAfter(`[data-action="${focus}"]`)
	}

	const onSubmit = (event: SubmitEvent | Event) => {
		event.preventDefault()
		if (busy) return
		const trimmed = name.trim()
		if (!trimmed) {
			errorKey = "limits.error.name"
			return
		}
		const amount = amountOf(limit.trim())
		if (amount === null || amount <= 0) {
			errorKey = "limits.error.limit"
			return
		}
		if (!owner) {
			errorKey = "limits.error.owner"
			return
		}
		errorKey = ""
		onsave({ id: group?.id ?? crypto.randomUUID(), name: trimmed, limit: amount, owner, color })
	}

	/** A radio's tab stop: the checked one, else the first when none is checked (roving tabindex). */
	function tabStop<T>(values: readonly T[], current: T | null, value: T) {
		const stop = current !== null && values.includes(current) ? current : values[0]
		return value === stop ? 0 : -1
	}

	/** Where a key moves a radio group's choice: the index it lands on, or null for other keys. */
	const radioStep = (key: string, at: number, length: number): number | null => {
		switch (key) {
			case "ArrowRight":
			case "ArrowDown":
				return (at + 1) % length
			case "ArrowLeft":
			case "ArrowUp":
				return at < 0 ? length - 1 : (at - 1 + length) % length
			case "Home":
				return 0
			case "End":
				return length - 1
			default:
				return null
		}
	}

	/**
	 * A radio group's keys (the holders, the colours): an arrow moves to the next or previous
	 * choice, wrapping, Home and End to the first and last; moving chooses it and takes focus
	 * with it. Space and Enter press the focused radio as a button does.
	 */
	const arrow = <T extends string>(
		event: KeyboardEvent,
		values: readonly T[],
		current: T | null,
		attr: string,
		choose: (value: T) => void,
	) => {
		// Step from the focused radio, which is the checked one unless none is checked yet.
		const from = (event.target as Element | null)?.closest(`[${attr}]`)?.getAttribute(attr) ?? current
		const next = radioStep(event.key, from === null ? -1 : values.indexOf(from as T), values.length)
		const value = next === null ? undefined : values[next]
		if (value === undefined) return
		event.preventDefault()
		choose(value)
		void focusAfter(`[${attr}="${value}"]`)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<Sheet heading={group ? tr("limits.edit", { name: group.name }) : tr("limits.add")} held={busy} {onclose}>
	<ErrorBanner message={error} />
	<form bind:this={form} onsubmit={onSubmit} novalidate>
		{#if errorKey}
			<p role="alert">{tr(errorKey)}</p>
		{/if}
		<label>
			{tr("limits.name")}
			<input name="name" bind:value={name} autocomplete="off" placeholder={tr("limits.namePlaceholder")}>
		</label>
		<label>
			{tr("limits.limit")}
			<input name="limit" inputmode="decimal" bind:value={limit} placeholder={tr("limits.limitPlaceholder")}>
		</label>
		<fieldset>
			<legend id={ownerLegend}>{tr("limits.owner")}</legend>
			<div
				class="seg"
				role="radiogroup"
				aria-labelledby={ownerLegend}
				onkeydown={(event) =>
					arrow(event, OWNERS, owner, "data-owner", (next) => {
						owner = next
					})}>
				{#each OWNERS as choice (choice)}
					<!-- biome-ignore lint/a11y/useSemanticElements: a segmented control of buttons, roving tabindex (WAI-ARIA radio group) -->
					<button
						type="button"
						role="radio"
						data-owner={choice}
						aria-checked={owner === choice ? "true" : "false"}
						tabindex={tabStop(OWNERS, owner, choice)}
						onclick={() => {
							owner = choice
						}}>
						{choice}
					</button>
				{/each}
			</div>
		</fieldset>
		<fieldset>
			<legend id={colorLegend}>{tr("limits.color")}</legend>
			<div class="swatch-row">
				<div
					class="swatches"
					role="radiogroup"
					aria-labelledby={colorLegend}
					onkeydown={(event) =>
						arrow(event, GROUP_COLORS, color, "data-color", (next) => {
							color = next
						})}>
					{#each GROUP_COLORS as choice (choice)}
						<!-- biome-ignore lint/a11y/useSemanticElements: swatch buttons, roving tabindex (WAI-ARIA radio group) -->
						<button
							type="button"
							role="radio"
							data-color={choice}
							data-g={choice}
							aria-label={tr(`color.${choice}`)}
							aria-checked={color === choice ? "true" : "false"}
							tabindex={tabStop(GROUP_COLORS, color, choice)}
							onclick={() => {
								color = choice
							}}>
							{#if color === choice}
								<SvgIcon name="check" />
							{/if}
						</button>
					{/each}
				</div>
				<button
					type="button"
					data-variant="quiet"
					data-action="random-color"
					onclick={() => {
						color = freeColor(color)
					}}>
					{tr("limits.color.random")}
				</button>
			</div>
		</fieldset>
		<button type="submit" disabled={busy}>{group ? tr("limits.save") : tr("limits.add")}</button>
		{#if group && !inUse}
			{@const current = group}
			<div class="danger">
				{#if asking}
					<span class="ask">{tr("cards.group.deleteAsk", { name: current.name })}</span>
					<button
						type="button"
						data-variant="danger"
						data-action="confirm-delete"
						disabled={busy}
						onclick={() => {
							// The question stays until the write lands: a failed delete still shows it.
							ondelete(current)
						}}>
						{tr("common.delete")}
					</button>
					<button type="button" data-variant="quiet" data-action="keep" onclick={() => swap(false, "delete-group")}>
						{tr("cards.group.keep")}
					</button>
				{:else}
					<button
						type="button"
						data-variant="danger"
						data-action="delete-group"
						disabled={busy}
						onclick={() => swap(true, "confirm-delete")}>
						{tr("cards.group.delete")}
					</button>
				{/if}
			</div>
		{/if}
	</form>
</Sheet>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	input {
		min-inline-size: 0;
		padding: var(--cc-space-3);
		font: inherit;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		min-inline-size: 0;
		padding: 0;
		margin: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: var(--cc-space-1);
		font-size: var(--cc-text-xs);
		font-weight: 600;
		color: var(--cc-text-muted);
		text-transform: uppercase;
		letter-spacing: var(--cc-tracking-label);
	}

	p[role="alert"] {
		margin: 0;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
		border-radius: var(--cc-radius-sm);
	}

	.seg {
		display: grid;
		grid-auto-columns: minmax(0, 1fr);
		grid-auto-flow: column;
		gap: var(--cc-space-1);
		padding: var(--cc-space-1);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.seg button {
		align-self: stretch;
		color: var(--cc-text);
		background: transparent;
		border-color: transparent;
	}

	.seg button[aria-checked="true"] {
		font-weight: 650;
		color: var(--cc-success);
		background: var(--cc-surface);
		border-color: var(--cc-border);
	}

	.swatch-row,
	.swatches {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--cc-space-2);
		align-items: center;
	}

	.swatch-row button {
		align-self: center;
	}

	.swatches button[data-color] {
		display: inline-grid;
		place-items: center;
		inline-size: calc(2 * var(--cc-space-4));
		block-size: calc(2 * var(--cc-space-4));
		padding: 0;
		color: var(--g-fg);
		background: var(--g-bg);
		border: var(--cc-border-width) solid color-mix(in oklab, var(--g-fg) 35%, transparent);
		border-radius: 50%;
	}

	.swatches button[data-color][aria-checked="true"] {
		box-shadow:
			0 0 0 var(--cc-rule-width) var(--cc-surface),
			0 0 0 calc(2 * var(--cc-rule-width)) var(--g-fg);
	}

	button[type="submit"] {
		padding: var(--cc-space-3) var(--cc-space-4);
		font-size: var(--cc-text-md);
		font-weight: 650;
		border-radius: var(--cc-radius-sm);
	}

	.danger {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cc-space-2);
	}

	.ask {
		flex: 1 1 auto;
		font-weight: 600;
	}
</style>
