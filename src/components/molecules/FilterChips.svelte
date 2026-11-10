<script lang="ts">
	import type { Snippet } from "svelte"

	/**
	 * One section of a filter sheet: a legend over a wrapping row of pill chips, drawn in the light
	 * DOM where app.css's `.filter-group` styles them. Each chip is a toggle (`aria-pressed`) that
	 * carries its value in `data-<name>` and hands it to `ontoggle`; the page decides what a tap
	 * means (add or take out, pick one, tap off). Extra chips go in `children`, after the options.
	 */
	interface Props {
		legend: string
		/** The data attribute each chip carries its value in: `type` gives `data-type`. */
		name: string
		options: readonly { value: string; label: string }[]
		selected: readonly string[]
		ontoggle: (value: string) => void
		children?: Snippet
	}

	const { legend, name, options, selected, ontoggle, children }: Props = $props()
</script>

<fieldset class="filter-group">
	<legend>{legend}</legend>
	<div class="filter-chips">
		{#each options as option (option.value)}
			<button
				type="button"
				data-variant="quiet"
				{...{ [`data-${name}`]: option.value }}
				aria-pressed={selected.includes(option.value) ? "true" : "false"}
				onclick={() => ontoggle(option.value)}>
				{option.label}
			</button>
		{/each}
		{@render children?.()}
	</div>
</fieldset>
