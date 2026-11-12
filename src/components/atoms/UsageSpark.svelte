<script lang="ts">
	import type { GroupColor } from "#lib/domain/group-color"
	import type { CardUsage } from "#lib/domain/usage"

	/**
	 * A card's last 12 statements as small bars, oldest first (DD-195). The scale is `max`, shared
	 * by every card drawn beside it, so the bars compare across cards. Only a picture: the words
	 * beside it (the 12-statement total, when last used) carry the same, so it is hidden from
	 * screen readers. A statement with nothing spent is a flat line; the open one is faint.
	 */
	interface Props {
		usage: CardUsage
		/** The largest statement among the cards shown together; 0 when none spent anything. */
		max: number
		/** The card's group colour, for the bars; left out, they are muted. */
		tone?: GroupColor | undefined
	}

	const { usage, max, tone }: Props = $props()
</script>

<span class="spark" data-g={tone} aria-hidden="true">
	{#each usage.statements as statement (statement.period)}
		{@const zero = statement.total <= 0 || max <= 0}
		<i
			data-zero={zero ? "" : undefined}
			data-open={statement.open ? "" : undefined}
			style:block-size={zero ? undefined : `${(statement.total / max) * 100}%`}></i>
	{/each}
</span>

<style>
	.spark {
		display: inline-grid;
		flex: none;
		grid-auto-columns: var(--cc-spark-bar);
		grid-auto-flow: column;
		align-items: end;
		gap: var(--cc-spark-gap);
		block-size: var(--cc-spark-height);
	}

	i {
		display: block;
		min-block-size: var(--cc-border-width);
		background: var(--g-fg, var(--cc-text-muted));
		border-radius: var(--cc-border-width);
	}

	i[data-zero] {
		block-size: var(--cc-border-width);
		background: color-mix(in oklab, var(--cc-text) 18%, transparent);
	}

	i[data-open] {
		opacity: var(--cc-usage-open-opacity);
	}

	@media (forced-colors: active) {
		i {
			background: CanvasText;
		}
	}
</style>
