<script lang="ts">
	import type { GlanceFigure } from "#lib/ui/glance"

	/**
	 * A glance panel, the one Cards and Transactions share (DD-210): one panel, a small title, then
	 * its figures in a grid split by hairlines, each a label over its figure (in its tone), with a
	 * note or a usage bar under it. Two to a row on a phone (an odd last one across the row) and all
	 * in one row from 900px.
	 */
	interface Props {
		title: string
		figures: GlanceFigure[]
		/** A test hook, kept from the panel this replaced. */
		testid?: string | undefined
	}

	const { title, figures, testid }: Props = $props()

	const id = $props.id()
</script>

<section class="glance" aria-labelledby="{id}-title" data-testid={testid}>
	<h2 id="{id}-title" class="glance__title">{title}</h2>
	<dl class="glance__figures" data-count={figures.length}>
		{#each figures as figure (figure.field)}
			<div data-field={figure.field}>
				<dt>{figure.label}</dt>
				<dd>
					<b data-numeric data-tone={figure.tone}>{figure.text}</b>
					{#if figure.note}
						<small class="glance__note">{figure.note}</small>
					{/if}
					{#if figure.bar}
						<span class="glance__bar" data-level={figure.bar.level} role="img" aria-label={figure.bar.label}>
							<span style:inline-size="{Math.min(100, Math.max(0, figure.bar.share))}%"></span>
						</span>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</section>

<style>
	.glance {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	/* Two classes, to outrank app.css's `.page h2`. */
	.glance .glance__title {
		margin: 0;
		padding: var(--cc-space-2) var(--cc-space-3) 0;
		font-size: var(--cc-text-xs);
		font-weight: 600;
		color: var(--cc-text-muted);
	}

	/* The hairlines are the border colour showing through the gaps between the cells. */
	.glance__figures {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--cc-border-width);
		margin: 0;
		margin-block-start: var(--cc-space-2);
		background: var(--cc-border);
		border-block-start: var(--cc-border-width) solid var(--cc-border);
	}

	/* An odd last figure takes the whole row on a phone, so no figure is squeezed into a third. */
	.glance__figures > div:last-child:nth-child(odd) {
		grid-column: 1 / -1;
	}

	@media (min-width: 900px) {
		.glance__figures {
			grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		}

		.glance__figures > div:last-child:nth-child(odd) {
			grid-column: auto;
		}
	}

	.glance__figures > div {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		min-inline-size: 0;
		padding: var(--cc-space-2) var(--cc-space-3) var(--cc-space-3);
		background: var(--cc-surface);
	}

	dt {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	dd {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		margin: 0;
	}

	b {
		font-size: var(--cc-text-lg);
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	/* Money out reads red and in green, each beside its label (UI-07); a warning in its tone. */
	b[data-tone="out"] {
		color: var(--cc-danger);
	}

	b[data-tone="in"] {
		color: var(--cc-success);
	}

	b[data-tone="warn"] {
		color: var(--cc-warning);
	}

	.glance__note {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	/* A card tile's rail, on its own line: grey, warning from 80%, danger past the limit. */
	.glance__bar {
		display: block;
		block-size: var(--cc-space-1);
		overflow: hidden;
		background: color-mix(in oklab, var(--cc-text) 10%, transparent);
		border-radius: var(--cc-radius-pill);
	}

	.glance__bar > span {
		display: block;
		block-size: 100%;
		background: var(--cc-text-muted);
		border-radius: inherit;
	}

	.glance__bar[data-level="high"] > span {
		background: var(--cc-warning);
	}

	.glance__bar[data-level="over"] > span {
		background: var(--cc-danger);
	}
</style>
