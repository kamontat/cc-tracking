<script lang="ts">
	import type { Snippet } from "svelte"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * A sub page's compact heading (prototype `subHead`) for an island, whose title is the
	 * reader's data (a card's name): a back control, the title over a muted `detail` line, and
	 * `actions` (an Edit link, a More menu) at its end. A string `back` is a link to that address;
	 * a function is a quiet button that runs it, for a step inside one page. The same markup as
	 * the legacy `subHeader`, so app.css draws both alike.
	 */
	interface Props {
		title: string
		detail?: string | undefined
		back: string | (() => void)
		actions?: Snippet
	}

	const { title, detail, back, actions }: Props = $props()

	let lang = $state(getLocale())
	const backLabel = $derived.by(() => {
		void lang
		return t("common.back")
	})

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="sub-header">
	{#if typeof back === "string"}
		<a data-action="back" href={back} aria-label={backLabel}><SvgIcon name="back" /></a>
	{:else}
		<button type="button" data-variant="quiet" data-action="back" aria-label={backLabel} onclick={back}>
			<SvgIcon name="back" />
		</button>
	{/if}
	<h1>
		<span class="sub-header__title">{title}</span>
		{#if detail}
			<small class="sub-header__detail">{detail}</small>
		{/if}
	</h1>
	{#if actions}
		<div class="sub-header__actions">{@render actions()}</div>
	{/if}
</div>
