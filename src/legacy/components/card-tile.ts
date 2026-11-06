import type { GroupRoom } from "#lib/domain/room"
import type { Card, LimitGroup } from "#lib/domain/types"

import { css, html, nothing, type TemplateResult } from "lit"

import { groupColor } from "#legacy/lib/ui/card-label"
import { groupInk } from "#legacy/styles/shared"
import { formatAmount } from "#lib/domain/money"
import { t } from "#lib/i18n/index"
import { roomLevel, roomNote, roomShare } from "#lib/ui/room-note"

/**
 * What one card tile shows (DD-151): every list of cards -- Home's *Ready to use*, the new-list
 * picker and the Cards page -- draws the same tile and fills its lines for the page.
 */
export type TileContent = {
	card: Card
	/** The group's room; null for a card with no group, which says so in place of the room. */
	room: GroupRoom | null
	/** The credit the card holds, in satang, for the word under the room. */
	credit: number
	/** Line 1, before `id) name`: the picker's tick. */
	lead?: TemplateResult
	/** Line 1, at the right: the last 4 (`mono`) or who holds the card. */
	corner: string
	mono?: boolean
	/** Line 2, at the right. Left out, the room has the line to itself. */
	aside?: string
	/** The aside's colour: `bad` red, `warn` amber; left out, muted. */
	asideTone?: "bad" | "warn"
	/**
	 * The payment picker: line 2's own figure and word (what is owed) in place of the room, with
	 * or without a group; the rail still comes from `room`.
	 */
	figure?: { amount?: string; word?: string }
	/** Line 3, muted: `closes … · due …`. Left out on Home. */
	facts?: string
	/** Home and the picker: plain room needs no word; credit, `N% used` and *over limit* still show. */
	plainRoom?: boolean
	/** Home: past the limit the amount turns red and has no word under it. */
	quietOver?: boolean
}

/** The tile's colour: its limit group's colour name, or nothing for a card with no group. */
export const tileTone = (card: Card, groups: LimitGroup[]) => groupColor(card, groups) ?? nothing

/** Line 1's corner on Home and Cards: `•••• 4821`, or nothing when no last 4 is stored. */
export const lastFour = (card: Card): string => (card.last4 ? `•••• ${card.last4}` : "")

/**
 * The inside of a card tile; the caller wraps it in an `a.tile` (opens the card) or a
 * `button.tile` (the picker's toggle) carrying `data-g` from `tileTone`. Line 1 is `id) name`
 * and the corner; line 2 the group's room and its word (`roomNote`), and the aside; line 3 the
 * facts. A rail along the bottom edge shows the group's used share, grey, amber from 80% and
 * red past the limit, the same on every page.
 */
export function tileBody(content: TileContent): TemplateResult {
	const { card, room } = content
	return html`<span class="name">${content.lead ?? nothing}<span class="label"><span class="id">${card.id})</span> ${card.name}</span></span>
		<span class="corner" ?data-mono=${content.mono}>${content.corner}</span>
		${content.figure ? figureLine(content.figure) : room ? roomLine(content, room) : html`<span class="room"><small>${t("cards.page.noGroup")}</small></span>`}
		${content.aside === undefined ? nothing : html`<span class="aside" data-tone=${content.asideTone ?? nothing}>${content.aside}</span>`}
		${content.facts === undefined ? nothing : html`<span class="facts">${content.facts}</span>`}
		${room ? rail(room) : nothing}`
}

function roomLine(content: TileContent, room: GroupRoom): TemplateResult {
	const note = roomNote(room, content.credit)
	const over = content.quietOver === true && note.tone === "bad"
	const word = over || (content.plainRoom === true && note.plain) ? null : note
	return html`<span class="room" data-tone=${over ? "bad" : nothing}>
		<b data-numeric>${formatAmount(room.room)}</b>
		${word ? html`<small data-tone=${word.tone ?? nothing}>${word.text}</small>` : nothing}
	</span>`
}

function figureLine(figure: NonNullable<TileContent["figure"]>): TemplateResult {
	return html`<span class="room">
		${figure.amount === undefined ? nothing : html`<b data-numeric>${figure.amount}</b>`}
		${figure.word === undefined ? nothing : html`<small>${figure.word}</small>`}
	</span>`
}

function rail(room: GroupRoom): TemplateResult {
	const share = roomShare(room)
	return html`<span class="rail" data-level=${roomLevel(room)} role="img"
		aria-label=${t("limits.usage", { share })}><span style=${`inline-size: ${share}%`}></span></span>`
}

/** The tiles' grid and the tile: one column on a phone, as many as fit from 900px. */
export const cardTileStyles = css`
	${groupInk}

	.tiles {
		display: grid;
		gap: var(--cc-space-2);
	}

	@media (min-width: 900px) {
		.tiles {
			grid-template-columns: repeat(auto-fill, minmax(var(--cc-tile-min), 1fr));
		}
	}

	.tile {
		--tile-bg: var(--cc-surface);
		--tile-fg: var(--cc-text-muted);
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: calc(var(--cc-space-1) / 2) var(--cc-space-3);
		align-self: stretch;
		inline-size: 100%;
		margin: 0;
		padding: var(--cc-space-2) var(--cc-space-3) calc(var(--cc-space-2) + var(--cc-space-1));
		overflow: hidden;
		font: inherit;
		font-size: var(--cc-text-sm);
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

	.tick {
		display: inline-grid;
		flex: none;
		place-items: center;
		inline-size: calc(var(--cc-space-4) + var(--cc-space-1));
		block-size: calc(var(--cc-space-4) + var(--cc-space-1));
		color: var(--cc-accent-text);
		background: var(--cc-surface);
		border: calc(var(--cc-border-width) * 1.5) solid
			color-mix(in oklab, var(--tile-fg) 40%, var(--cc-border));
		border-radius: var(--cc-radius-xs);
	}

	.tile[aria-pressed="true"] .tick {
		background: var(--cc-accent);
		border-color: var(--cc-accent);
	}

	.tick .icon {
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
`
