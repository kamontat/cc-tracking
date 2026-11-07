<script lang="ts">
	import { onMount } from "svelte"

	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { watchForUpdates } from "#lib/offline/register"

	/**
	 * Says a new version of the site has downloaded, with a button to reload into it (PRD DD-181).
	 * Nothing shows until then. Every page carries it (`BaseLayout`), persisted across ClientRouter
	 * swaps, so the service worker is registered once per visit. The dev server builds no worker.
	 */
	interface Props {
		/** Watches for a new version; tests pass one they can offer from. */
		watch?: (onUpdate: (apply: () => void) => void) => void
	}

	const {
		watch = (onUpdate) => {
			if (import.meta.env.DEV) return
			watchForUpdates({
				container: navigator.serviceWorker,
				onUpdate,
				reload: () => location.reload(),
				events: document,
			}).catch((failure: unknown) => console.error(failure))
		},
	}: Props = $props()

	let apply = $state<(() => void) | null>(null)
	let lang = $state(getLocale())
	const message = $derived.by(() => {
		void lang
		return t("update.message")
	})
	const reloadLabel = $derived.by(() => {
		void lang
		return t("update.reload")
	})

	onMount(() => {
		watch((next) => {
			apply = next
		})
		return subscribe(() => {
			lang = getLocale()
		})
	})
</script>

{#if apply}
	<div class="update-bar" role="status">
		<p>{message}</p>
		<button type="button" onclick={() => apply?.()}>{reloadLabel}</button>
	</div>
{/if}
