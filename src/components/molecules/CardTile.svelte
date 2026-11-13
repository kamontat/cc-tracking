<script lang="ts">
	import type { Snippet } from "svelte"
	import type { GroupColor } from "#lib/domain/group-color"
	import type { GroupRoom } from "#lib/domain/room"
	import type { Card } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { formatAmount } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { roomLevel, roomNote, roomShare } from "#lib/ui/room-note"

	/**
	 * One card tile (DD-151): every list of cards -- Home's *Ready to use*, the add-a-card sheet
	 * and the Cards page -- draws the same tile and fills its lines for the page. With an `href`
	 * it is an `a.tile` that opens the card; without, a `button.tile`, the picker's toggle. Line 1
	 * is `id) name` and the corner; line 2 the group's room and its word (`roomNote`), and the
	 * aside; line 3 the facts. A rail along the bottom edge shows the group's used share, grey,
	 * amber from 80% and red past the limit, the same on every page.
	 */
	interface Props {
		card: Card
		/** The group's room; null leaves line 2 to the `figure`, or to the aside alone. */
		room: GroupRoom | null
		/** The credit the card holds, in satang, for the word under the room. */
		credit: number
		/** The group's colour name (`tileTone`); left out, the tile wears none. */
		tone?: GroupColor | undefined
		/** The card page to open; left out, the tile is a button. */
		href?: string | undefined
		/** The picker's toggle state, as `aria-pressed`; only on the button form. */
		pressed?: boolean | undefined
		/** The tile's accessible name, when its text alone does not say enough. */
		label?: string | undefined
		onclick?: (() => void) | undefined
		/** Line 1, before `id) name`: the picker's tick. */
		lead?: Snippet | undefined
		/** Line 1, at the right: the last 4 (`mono`) or who holds the card. */
		corner: string
		mono?: boolean
		/** Line 2, at the right. Left out, the room has the line to itself. */
		aside?: string | undefined
		/** The aside's colour: `bad` red, `warn` amber; left out, muted. */
		asideTone?: "bad" | "warn" | undefined
		/**
		 * The payment picker: line 2's own figure and word (what is owed) in place of the room, with
		 * or without a group; the rail still comes from `room`.
		 */
		figure?: { amount?: string; word?: string } | undefined
		/** Line 3, muted: `closes … · due …`. Left out on Home. */
		facts?: string | undefined
		/** A last line across the tile, under the facts: the new-list sheet's 12-statement use. */
		foot?: Snippet | undefined
		/** Home and the picker: plain room needs no word; credit, `N% used` and *over limit* still show. */
		plainRoom?: boolean
		/** Home: past the limit the amount turns red and has no word under it. */
		quietOver?: boolean
	}

	const {
		card,
		room,
		credit,
		tone,
		href,
		pressed,
		label,
		onclick,
		lead,
		corner,
		mono = false,
		aside,
		asideTone,
		figure,
		facts,
		foot,
		plainRoom = false,
		quietOver = false,
	}: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/** Line 2's word under the room, or null when it says nothing; and whether the amount is red. */
	const line = $derived.by(() => {
		void lang
		if (!room) return null
		const note = roomNote(room, credit)
		const over = quietOver && note.tone === "bad"
		return { over, word: over || (plainRoom && note.plain) ? null : note }
	})

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet body()}
	<span class="name"
		>{@render lead?.()}<span class="label"><span class="id">{card.id})</span> {card.name}</span></span
	>
	<span class="corner" data-mono={mono ? "" : undefined}>{corner}</span>
	{#if figure}
		<span class="room">
			{#if figure.amount !== undefined}
				<b data-numeric>{figure.amount}</b>
			{/if}
			{#if figure.word !== undefined}
				<small>{figure.word}</small>
			{/if}
		</span>
	{:else if room && line}
		<span class="room" data-tone={line.over ? "bad" : undefined}>
			<b data-numeric>{formatAmount(room.room)}</b>
			{#if line.word}
				<small data-tone={line.word.tone ?? undefined}>{line.word.text}</small>
			{/if}
		</span>
	{/if}
	{#if aside !== undefined}
		<span class="aside" data-tone={asideTone}>{aside}</span>
	{/if}
	{#if facts !== undefined}
		<span class="facts">{facts}</span>
	{/if}
	{#if foot}
		<span class="foot">{@render foot()}</span>
	{/if}
	{#if room}
		{@const share = roomShare(room)}
		<span class="rail" data-level={roomLevel(room)} role="img" aria-label={tr("limits.usage", { share })}>
			<span style:inline-size="{share}%"></span>
		</span>
	{/if}
{/snippet}

{#if href !== undefined}
	<a class="tile" data-g={tone} data-card={card.id} aria-label={label} {href} {onclick}>{@render body()}</a>
{:else}
	<button
		type="button"
		class="tile"
		data-g={tone}
		data-card={card.id}
		aria-pressed={pressed === undefined ? undefined : pressed ? "true" : "false"}
		aria-label={label}
		{onclick}>
		{@render body()}
	</button>
{/if}

<style>
	/*
	 * The tile. Its selectors carry two classes (the scope's and `.tile`), so they outrank the
	 * light-DOM `.page button` and `a:any-link` rules in app.css.
	 */
	.tile {
		--tile-bg: var(--cc-surface);
		--tile-fg: var(--cc-text-muted);
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: calc(var(--cc-space-1) / 2) var(--cc-space-3);
		align-self: stretch;
		box-sizing: border-box;
		inline-size: 100%;
		margin: 0;
		padding: var(--cc-space-2) var(--cc-space-3) calc(var(--cc-space-2) + var(--cc-space-1));
		overflow: hidden;
		font: inherit;
		font-size: var(--cc-text-sm);
		font-weight: 400;
		line-height: 1.35;
		white-space: normal;
		text-align: start;
		text-decoration: none;
		color: var(--cc-text);
		cursor: pointer;
		background: var(--tile-bg);
		border: var(--cc-border-width) solid color-mix(in oklab, var(--tile-fg) 18%, transparent);
		border-radius: var(--cc-radius-sm);
	}

	.tile[data-g] {
		--tile-bg: var(--g-bg);
		--tile-fg: var(--g-fg);
	}

	/* Hover deepens the edge in the tile's own colour, never an underline (DD-105); the ground
	   stays, out-ranking a page's own button hover. */
	.tile:hover {
		text-decoration: none;
		background: var(--tile-bg);
		border-color: color-mix(in oklab, var(--tile-fg) 55%, transparent);
	}

	.tile:focus-visible {
		outline: none;
		box-shadow: var(--cc-focus-ring);
	}

	/* A ticked tile: a 2px accent outline that shifts nothing. */
	.tile[aria-pressed="true"] {
		border-color: var(--cc-accent);
		outline: var(--cc-border-width) solid var(--cc-accent);
	}

	.name {
		display: flex;
		align-items: center;
		gap: var(--cc-space-2);
		min-inline-size: 0;
		font-weight: 700;
	}

	.label {
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.id {
		font-weight: 650;
		color: var(--cc-text-muted);
	}

	.corner,
	.aside {
		font-size: var(--cc-text-xs);
		white-space: nowrap;
		text-align: end;
	}

	.corner {
		font-weight: 650;
		color: var(--tile-fg);
	}

	.corner[data-mono] {
		font-family: var(--cc-font-mono);
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	.aside {
		color: var(--cc-text-muted);
	}

	.aside[data-tone="warn"] {
		color: var(--cc-warning);
	}

	.aside[data-tone="bad"] {
		color: var(--cc-danger);
	}

	/* A long word (a credit) ends in an ellipsis rather than run under the aside. */
	.room {
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.room b {
		font-size: var(--cc-text-md);
		font-weight: 750;
	}

	.room[data-tone="bad"] b {
		color: var(--cc-danger);
	}

	.room small {
		margin-inline-start: var(--cc-space-1);
		font-size: var(--cc-text-xs);
		font-weight: 600;
		color: var(--cc-text-muted);
	}

	.room > small:only-child {
		margin-inline-start: 0;
	}

	.room small[data-tone="warn"] {
		color: var(--cc-warning);
	}

	.room small[data-tone="bad"] {
		color: var(--cc-danger);
	}

	.facts {
		grid-column: 1 / -1;
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.foot {
		display: flex;
		grid-column: 1 / -1;
		align-items: flex-end;
		gap: var(--cc-space-2);
		padding-block-start: var(--cc-space-1);
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.rail {
		position: absolute;
		inset: auto 0 0;
		display: block;
		block-size: var(--cc-space-1);
		background: color-mix(in oklab, var(--cc-text) 10%, transparent);
	}

	.rail > span {
		display: block;
		block-size: 100%;
		background: var(--cc-text-muted);
	}

	.rail[data-level="high"] > span {
		background: var(--cc-warning);
	}

	.rail[data-level="over"] > span {
		background: var(--cc-danger);
	}

	/* The picker's tick, rendered by the caller through `lead`, so outside this scope. */
	.tile :global(.tick) {
		display: inline-grid;
		flex: none;
		place-items: center;
		inline-size: calc(var(--cc-space-4) + var(--cc-space-1));
		block-size: calc(var(--cc-space-4) + var(--cc-space-1));
		color: var(--cc-accent-text);
		background: var(--cc-surface);
		border: calc(var(--cc-border-width) * 1.5) solid color-mix(in oklab, var(--tile-fg) 40%, var(--cc-border));
		border-radius: var(--cc-radius-xs);
	}

	.tile[aria-pressed="true"] :global(.tick) {
		background: var(--cc-accent);
		border-color: var(--cc-accent);
	}

	.tile :global(.tick .icon) {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	@media (forced-colors: active) {
		.tile {
			border-color: CanvasText;
		}

		.tile[aria-pressed="true"] {
			outline-color: Highlight;
		}

		.rail > span {
			background: CanvasText;
		}
	}
</style>
