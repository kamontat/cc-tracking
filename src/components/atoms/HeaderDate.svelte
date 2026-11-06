<script lang="ts">
	import { onMount } from "svelte"

	import { headerDate, today } from "#lib/domain/date"
	import { getLocale, subscribe } from "#lib/i18n/index"

	/**
	 * Today in the header, in both of its forms; the stylesheet shows one per screen size. The
	 * date and the language are the reader's, so the build ships the frame empty and the island
	 * fills it in the browser (PRD DD-172), and again on a change of language.
	 */
	interface Props {
		/** The page's only clock reading; tests pass a fixed one. */
		clock?: () => Date
	}

	const { clock = () => new Date() }: Props = $props()

	let short = $state("")
	let long = $state("")

	onMount(() => {
		const paint = () => {
			const day = today(clock())
			const locale = getLocale()
			short = headerDate(day, locale, false)
			long = headerDate(day, locale, true)
		}
		paint()
		return subscribe(paint)
	})
</script>

<span class="site-header__date-short">{short}</span><span class="site-header__date-long">{long}</span>
