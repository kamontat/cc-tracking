<script lang="ts">
	import { type CycleInput, cycleModel, fitCycle } from "#lib/ui/cycle-line"

	/**
	 * A statement's billing cycle line (DD-165), drawn from `cycleModel`: a track, a fill to today
	 * and the markers on one scale. It is one image to a screen reader. On first paint a crowded
	 * label is a guess (`quiet`); once laid out the labels are measured (`fitCycle`), and a
	 * `ResizeObserver` refits them whenever the line's size changes (a row opening, a rotated
	 * phone). The caller re-passes `input` on a language switch, so the words follow it.
	 */
	interface Props {
		input: CycleInput
	}

	const { input }: Props = $props()

	const model = $derived(cycleModel(input))

	const fit = (line: HTMLElement) => {
		// Read the model, so a redraw (new words, new marks) is measured again.
		void model
		fitCycle(line)
		if (typeof ResizeObserver === "undefined") return
		const observer = new ResizeObserver(() => fitCycle(line))
		observer.observe(line)
		return () => observer.disconnect()
	}
</script>

<div class="a-cycle" role="img" aria-label={model.spoken} {@attach fit}>
	<span class="a-track"></span>
	<span class="a-fill" data-late={model.late ? "" : undefined} style:inline-size={model.fill}></span>
	{#each model.markers as marker, i (`${marker.kind}:${i}`)}
		<span
			class="a-mk"
			aria-hidden="true"
			data-mark={marker.kind}
			data-edge={marker.edge}
			data-late={marker.late ? "" : undefined}
			data-quiet={marker.quiet ? "" : undefined}
			style:inset-inline-start={marker.at}
			><i></i><span class="a-lbl">{marker.label}</span></span
		>
	{/each}
</div>

<style>
	/* A track on the axis, a fill from its start, and markers placed by inline style along it.
	   Circles hang on the axis with their label under; Today is a tick with its label above, so
	   it never meets a neighbour's label. */
	.a-cycle {
		position: relative;
		block-size: var(--cc-cycle-height);
		margin-inline: var(--cc-space-1);
	}

	.a-track,
	.a-fill {
		position: absolute;
		inset-block-start: calc(var(--cc-cycle-axis) - var(--cc-cycle-track) / 2);
		inset-inline-start: 0;
		block-size: var(--cc-cycle-track);
		border-radius: var(--cc-radius-pill);
	}

	.a-track {
		inset-inline-end: 0;
		background: var(--cc-surface-sunken);
	}

	.a-fill {
		background: var(--cc-text-muted);
		opacity: var(--cc-cycle-fill-opacity);
	}

	.a-fill[data-late] {
		background: var(--cc-danger);
		opacity: 1;
	}

	.a-mk {
		position: absolute;
		inset-block-start: calc(var(--cc-cycle-axis) - var(--cc-cycle-dot) / 2);
		translate: -50% 0;
		display: grid;
		justify-items: center;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-2xs);
		line-height: 1.5;
		color: var(--cc-text-muted);
		white-space: nowrap;
	}

	.a-mk i {
		box-sizing: border-box;
		inline-size: var(--cc-cycle-dot);
		block-size: var(--cc-cycle-dot);
		background: var(--cc-surface);
		border: var(--cc-ring-width) solid var(--cc-text-muted);
		border-radius: var(--cc-radius-pill);
	}

	/* A label that would overlap a more important one keeps its place but not its words. */
	.a-mk[data-quiet] .a-lbl {
		visibility: hidden;
	}

	.a-mk[data-mark="buy"] i {
		background: var(--cc-text);
		border-color: var(--cc-text);
	}

	.a-mk[data-late] {
		font-weight: 650;
		color: var(--cc-danger);
	}

	.a-mk[data-late] i {
		border-color: var(--cc-danger);
	}

	.a-mk[data-mark="now"] {
		inset-block-start: auto;
		inset-block-end: calc(var(--cc-cycle-height) - var(--cc-cycle-axis) - var(--cc-cycle-tick) / 2);
		display: flex;
		flex-direction: column-reverse;
		align-items: center;
		gap: calc(var(--cc-space-1) / 2);
		font-weight: 650;
		color: var(--cc-accent);
	}

	.a-mk[data-mark="now"] i {
		inline-size: var(--cc-rule-width);
		block-size: var(--cc-cycle-tick);
		background: var(--cc-accent);
		border: 0;
		border-radius: var(--cc-radius-pill);
	}

	.a-mk[data-edge="start"] {
		translate: 0 0;
		justify-items: start;
		align-items: flex-start;
	}

	.a-mk[data-edge="end"] {
		translate: -100% 0;
		justify-items: end;
		align-items: flex-end;
	}
</style>
