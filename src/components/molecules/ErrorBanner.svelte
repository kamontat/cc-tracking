<script lang="ts">
	/**
	 * A page's error, with a way to try again: an alert in the danger tone, drawn by app.css
	 * (`.error-banner`). Nothing shows while there is no message. The caller passes text already
	 * in the reader's language and re-passes it on a language switch. Without `onretry` it only
	 * says what went wrong, as a sheet's failed save does: the sheet's own buttons try again.
	 */
	interface Props {
		message: string
		retryLabel?: string
		onretry?: () => void
	}

	const { message, retryLabel, onretry }: Props = $props()
</script>

{#if message}
	<article class="error-banner" role="alert" data-tone="danger">
		<p>{message}</p>
		{#if onretry && retryLabel}
			<button type="button" data-variant="quiet" onclick={onretry}>{retryLabel}</button>
		{/if}
	</article>
{/if}
