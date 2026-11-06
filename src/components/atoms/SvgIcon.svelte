<script lang="ts">
	import { ICON_PATHS, type IconName } from "#lib/ui/icon-paths"

	/**
	 * The `Icon` atom for Svelte islands: the same drawing from `#lib/ui/icon-paths`. Decorative
	 * only, so it is hidden from assistive technology; the button or link around it names it.
	 */
	interface Props {
		name: IconName
	}

	const { name }: Props = $props()
</script>

<svg
	class="icon"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.9"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false">
	<!-- The paths are this repository's own constants, never the reader's input. -->
	{@html ICON_PATHS[name]}
</svg>
