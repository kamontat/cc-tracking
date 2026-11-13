<script lang="ts">
	import { onMount } from "svelte"

	import { getLocale, subscribe } from "#lib/i18n/index"
	import { formatBuiltLocal, parseBuiltAt } from "#lib/ui/build-info"

	/**
	 * When the page was built, on the viewer's own clock (its zone a GMT offset, `GMT+7`) and in
	 * their language. Both are only known in the browser, so the build ships it empty and the
	 * island fills it in (PRD DD-172), and again on a change of language. An unreadable stamp
	 * shows nothing.
	 */
	interface Props {
		/** The build's ISO stamp. */
		builtAt: string
		/** The clock to show it on, in minutes east of GMT; the viewer's own, unless a test passes one. */
		offset?: number
	}

	const { builtAt, offset }: Props = $props()

	let text = $state("")

	onMount(() => {
		const paint = () => {
			const when = parseBuiltAt(builtAt)
			text = when ? formatBuiltLocal(when, getLocale(), offset) : ""
		}
		paint()
		return subscribe(paint)
	})
</script>

{text}
