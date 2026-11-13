<script lang="ts">
	import type { Snippet } from "svelte"

	import { onMount } from "svelte"

	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { afterExit } from "#lib/ui/motion"

	/**
	 * A sheet around whatever is passed in as children: on a phone it rises from the bottom edge,
	 * the screen's full width, with a grab handle; from 900px it is a centred dialog. It opens
	 * itself (`showModal()`) the moment it is mounted, so a page shows one by rendering it and
	 * hides it by rendering it away -- there is no `open` to keep in step. Escape, the backdrop
	 * and the worded Close never close it directly: each plays the exit and then calls `onclose`,
	 * leaving the page to take it away, and each does nothing while `held`.
	 *
	 * A page that closes the sheet itself (an apply button, a finished write) takes the instance
	 * with `bind:this` and calls `leave(then)`: the sheet slides (or fades) out, then `then` runs
	 * and should render it away.
	 */
	interface Props {
		heading: string
		/**
		 * Held open: Escape, the backdrop and Close do nothing, so a page that would refuse to close
		 * (a save in flight) never sees its sheet slide away first.
		 */
		held?: boolean
		/** From 900px, the wide dialog (`--cc-sheet-wide-max`) rather than the payment sheet's width. */
		wide?: boolean
		/** Asked once the exit has played; the page renders the sheet away. */
		onclose: () => void
		children: Snippet
	}

	const { heading, held = false, wide = false, onclose, children }: Props = $props()

	const uid = $props.id()
	const headingId = `${uid}-heading`

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: "common.close") => {
		void lang
		return t(key)
	}

	let dialog: HTMLDialogElement | undefined = $state()
	/** Set once the sheet is being taken away, so a held one is not re-opened on its way out. */
	let gone = false

	// Whatever had focus when this opened. A dialog that is close()d hands focus back itself, but
	// this one is rendered away instead, which skips that step and drops focus onto <body>. Walked
	// down through shadow roots: `document.activeElement` names only the outermost host.
	const opener = (() => {
		if (typeof document === "undefined") return null
		let active = document.activeElement
		while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
		return active instanceof HTMLElement ? active : null
	})()

	/**
	 * Plays the sheet's exit (marking the dialog `data-closing`) and runs `then` once it has ended
	 * -- at once when nothing animates (reduced motion, a test DOM). A second call while it is
	 * leaving does nothing. The mark is set on the element straight away, not through state, so
	 * the exit animation is running by the time `afterExit` looks for it.
	 */
	export function leave(then: () => void): void {
		const target = dialog
		if (!target) {
			then()
			return
		}
		if (target.hasAttribute("data-closing")) return
		target.toggleAttribute("data-closing", true)
		afterExit(target, then)
	}

	const requestClose = () => {
		if (held) return
		leave(onclose)
	}

	const onCancel = (event: Event) => {
		event.preventDefault()
		requestClose()
	}

	const onBackdrop = (event: MouseEvent) => {
		// The padding lives on `.body`, so only a click on the backdrop lands on the dialog itself.
		if (event.target === dialog) requestClose()
	}

	const onDialogClose = () => {
		// A second Escape closes a dialog with no cancel to refuse; a held one opens again.
		if (held && !gone && dialog?.isConnected) dialog.showModal()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		// Listened for here rather than in the markup: the backdrop's keyboard twin is Escape (the dialog's
		// `cancel` event), so the dialog needs no key handler of its own.
		dialog?.addEventListener("click", onBackdrop)
		dialog?.showModal()
		return () => {
			unsubscribe()
			dialog?.removeEventListener("click", onBackdrop)
			gone = true
			if (dialog?.open) dialog.close()
			if (opener?.isConnected) opener.focus()
		}
	})
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={headingId}
	data-wide={wide || undefined}
	oncancel={onCancel}
	onclose={onDialogClose}>
	<div class="body">
		<span class="grab" aria-hidden="true"></span>
		<header>
			<h2 id={headingId}>{heading}</h2>
			<button type="button" data-variant="quiet" data-action="close" onclick={requestClose}>
				{tr("common.close")}
			</button>
		</header>
		{@render children()}
	</div>
</dialog>

<style>
	dialog {
		inline-size: 100%;
		max-inline-size: 100%;
		max-block-size: calc(100dvh - var(--cc-space-7));
		margin: auto 0 0;
		padding: 0;
		color: inherit;
		background: var(--cc-bg);
		border: 0;
		border-radius: var(--cc-radius-md) var(--cc-radius-md) 0 0;
	}

	dialog::backdrop {
		background: var(--cc-backdrop);
	}

	/* The padding lives here, not on the dialog, so a click anywhere inside the visible box lands
	   on this element and only a click on the backdrop lands on the dialog itself. */
	.body {
		gap: var(--cc-space-4);
		padding: var(--cc-space-2) var(--cc-space-4) calc(var(--cc-space-5) + env(safe-area-inset-bottom, 0px));
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-3);
	}

	h2 {
		margin: 0;
		font-size: var(--cc-text-lg);
		font-weight: 700;
	}

	.grab {
		display: block;
		align-self: center;
		inline-size: calc(var(--cc-space-7) - var(--cc-space-1));
		block-size: var(--cc-space-1);
		background: var(--cc-border);
		border-radius: var(--cc-radius-pill);
	}

	/* What the shadow `controls` gave every button in a sheet that app.css's `.page button` does
	   not: one line, a pointer, and a dimmed, still look while it waits. */
	dialog :global(button) {
		white-space: nowrap;
		cursor: pointer;
	}

	dialog :global(button:disabled) {
		cursor: default;
		opacity: 0.55;
	}

	/* The sheet rises into view, and its backdrop fades in under it. */
	@keyframes sheet-rise {
		from {
			transform: translateY(100%);
		}
	}

	@keyframes sheet-grow {
		from {
			opacity: 0;
			transform: scale(var(--cc-sheet-scale-from));
		}
	}

	@keyframes backdrop-in {
		from {
			opacity: 0;
		}
	}

	dialog[open] {
		animation: sheet-rise var(--cc-sheet-motion) var(--cc-sheet-ease);
	}

	dialog[open]::backdrop {
		animation: backdrop-in var(--cc-sheet-motion) var(--cc-sheet-ease);
	}

	/* Closing plays it backwards: the sheet slides down (shrinks and fades from 900px) and the
	   backdrop fades out, and only then does the page take it away. */
	@keyframes sheet-fall {
		to {
			transform: translateY(100%);
		}
	}

	@keyframes sheet-shrink {
		to {
			opacity: 0;
			transform: scale(var(--cc-sheet-scale-from));
		}
	}

	@keyframes backdrop-out {
		to {
			opacity: 0;
		}
	}

	dialog[open][data-closing] {
		animation: sheet-fall var(--cc-sheet-motion) var(--cc-sheet-ease) forwards;
	}

	dialog[open][data-closing]::backdrop {
		animation: backdrop-out var(--cc-sheet-motion) var(--cc-sheet-ease) forwards;
	}

	@media (min-width: 900px) {
		dialog {
			inline-size: min(100% - 2 * var(--cc-space-4), var(--cc-sheet-max));
			max-block-size: calc(100dvh - 2 * var(--cc-space-4));
			margin: auto;
			border-radius: var(--cc-radius-md);
			box-shadow: var(--cc-shadow-lg);
		}

		dialog[data-wide] {
			inline-size: min(100% - 2 * var(--cc-space-4), var(--cc-sheet-wide-max));
		}

		.body {
			padding: var(--cc-space-4) var(--cc-space-4) var(--cc-space-5);
		}

		.grab {
			display: none;
		}

		dialog[open] {
			animation-name: sheet-grow;
		}

		dialog[open][data-closing] {
			animation-name: sheet-shrink;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		dialog[open],
		dialog[open]::backdrop,
		dialog[open][data-closing],
		dialog[open][data-closing]::backdrop {
			animation: none;
		}
	}
</style>
