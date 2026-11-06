<script lang="ts">
	import { onMount } from "svelte"

	import { getLocale, subscribe } from "#lib/i18n/index"
	import { formatBuiltLocal, parseBuiltAt, viewerTimeZone } from "#lib/ui/build-info"

	/**
	 * When the page was built, in the viewer's own time zone and language. Both are only known
	 * in the browser, so the build ships it empty and the island fills it in (PRD DD-172), and
	 * again on a change of language. An unreadable stamp shows nothing.
	 */
	interface Props {
		/** The build's ISO stamp. */
		builtAt: string
		/** The zone to show it in; the viewer's own, unless a test passes one. */
		timeZone?: string
	}

	const { builtAt, timeZone }: Props = $props()

	let text = $state("")

	onMount(() => {
		const paint = () => {
			const when = parseBuiltAt(builtAt)
			text = when ? formatBuiltLocal(when, getLocale(), timeZone ?? viewerTimeZone()) : ""
		}
		paint()
		return subscribe(paint)
	})
</script>

{text}
