<script lang="ts">
	import type { GroupPanel } from "#lib/domain/cards-view"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import { toGroupColor } from "#lib/domain/group-color"
	import { formatAmount } from "#lib/domain/money"
	import { ownerOf } from "#lib/domain/owner"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The Cards page's *Limit groups* (prototype `vCards` aside): one heading row (`.sec-head`,
	 * which the page hides on a phone) with the count and *Add group* (`onaddgroup`) at its end,
	 * then a panel per group -- `name (holder)`, `room of limit`, the bar in the tiles' rail
	 * colours, its cards' ids, `N% used` and *getting full* from 80%, or *over limit* -- each a
	 * button that calls `onopengroup` with the group's id.
	 */
	interface Props {
		panels: GroupPanel[]
		/** A panel was tapped: open its group. */
		onopengroup: (id: string) => void
		/** *Add group* was tapped. */
		onaddgroup: () => void
	}

	const { panels, onopengroup, onaddgroup }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/**
	 * The bar's tint, as a card tile's rail (`roomLevel`): over once the room is below zero,
	 * getting full from 80%, else within.
	 */
	const level = (panel: GroupPanel) => (panel.room < 0 ? "over" : panel.full ? "high" : "within")

	const note = (panel: GroupPanel) => {
		const over = level(panel) === "over"
		return [
			panel.cardIds.join(", "),
			over ? tr("cards.page.over") : tr("cards.page.used", { pct: panel.usedPct }),
			panel.full && !over ? tr("cards.group.full") : "",
		]
			.filter(Boolean)
			.join(" · ")
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="group-panels">
	<div class="sec-head" part="head">
		<span class="sec-title">
			<h2>{tr("limits.title")}</h2>
			<small>{panels.length}</small>
		</span>
		<button type="button" data-variant="quiet" data-action="add-group" onclick={() => onaddgroup()}>
			<SvgIcon name="plus" />{tr("cards.group.add")}
		</button>
	</div>
	{#if panels.length === 0}
		<p class="empty">{tr("cards.group.empty")}</p>
	{:else}
		<!-- Unkeyed, as the Lit list was: a group id is unique in the store, but nothing here relies on it. -->
		{#each panels as panel}
			{@const group = panel.group}
			<button
				type="button"
				class="gpanel"
				data-group={group.id}
				data-g={toGroupColor(group.color) ?? undefined}
				onclick={() => onopengroup(group.id)}>
				<span class="ghead">
					<span class="gname">{group.name} ({ownerOf(group)})</span>
					<span data-numeric
						>{tr("cards.group.roomOf", { room: formatAmount(panel.room), limit: formatAmount(panel.limit) })}</span
					>
				</span>
				<span class="usage" data-level={level(panel)} aria-hidden="true">
					<span style:inline-size="{Math.min(100, Math.max(0, panel.usedPct))}%"></span>
				</span>
				<span class="gnote">{note(panel)}</span>
			</button>
		{/each}
	{/if}
</div>

<style>
	.group-panels {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	.sec-head {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-2) var(--cc-space-3);
	}

	.sec-title {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: var(--cc-space-2);
	}

	/* Two classes, to outrank app.css's `.page h2` and `.page small`. */
	.sec-title h2 {
		margin: 0;
		font-size: var(--cc-text-lg);
		font-weight: 700;
	}

	.sec-head small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	/* Out-ranks app.css's `.page button[data-variant="quiet"]`, which would start it at the top. */
	.sec-head button[data-action="add-group"] {
		display: inline-flex;
		align-items: center;
		gap: var(--cc-space-1);
		align-self: center;
		white-space: nowrap;
		cursor: pointer;
	}

	.sec-head [data-action="add-group"] :global(.icon) {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	/* A card list (one panel per group); two classes out-rank app.css's `.page button`. */
	.gpanel {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		align-self: stretch;
		gap: var(--cc-space-2);
		box-sizing: border-box;
		inline-size: 100%;
		margin: 0;
		padding: var(--cc-space-3) var(--cc-space-4);
		font: inherit;
		font-weight: 400;
		line-height: 1.35;
		white-space: normal;
		text-align: start;
		color: var(--cc-text);
		cursor: pointer;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.gpanel:hover {
		background: var(--cc-surface-sunken);
	}

	/* A group with a colour wears its soft tint; hover deepens the edge, never an underline. */
	.gpanel[data-g] {
		background: var(--g-soft);
		border-color: color-mix(in oklab, var(--g-fg) 18%, transparent);
	}

	.gpanel[data-g]:hover {
		border-color: color-mix(in oklab, var(--g-fg) 55%, transparent);
	}

	.ghead {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cc-space-2);
	}

	.gname {
		font-weight: 650;
	}

	.gpanel[data-g] .gname {
		color: var(--g-fg);
	}

	.ghead [data-numeric] {
		font-size: var(--cc-text-sm);
		white-space: nowrap;
	}

	.gnote {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	/* The usage bar, in the tiles' rail colours. */
	.usage {
		display: block;
		inline-size: 100%;
		block-size: var(--cc-space-1);
		overflow: hidden;
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.usage > span {
		display: block;
		block-size: 100%;
		background: var(--cc-text-muted);
		border-radius: var(--cc-radius-sm);
	}

	.usage[data-level="high"] > span {
		background: var(--cc-warning);
	}

	.usage[data-level="over"] > span {
		background: var(--cc-danger);
	}

	.empty {
		margin: 0;
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
		text-align: center;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	@media (forced-colors: active) {
		.usage {
			border: var(--cc-border-width) solid;
		}

		.usage > span {
			background: CanvasText;
		}
	}
</style>
