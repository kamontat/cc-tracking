<script lang="ts">
	import type { MessageKey } from "#lib/i18n/index"
	import type { MoreItem } from "#lib/ui/more-menu"

	import { flushSync, onMount } from "svelte"

	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * A *More* (`⋯`) button that opens a small list of buttons under it (prototype `subHead`'s
	 * actions). Opening focuses the first; Escape or a click outside closes it. Escape and a choice
	 * hand focus back to `⋯`; a click outside leaves it with what was clicked. An item with `ask`
	 * swaps the list for the question with *Delete* (danger) and *Keep* (UI-09), focus following
	 * each swap. A choice closes the list, then runs the item's `onselect` and the menu's
	 * `onselect` with its action. Focus moves with the keyboard's ring only when the menu was opened
	 * from the keyboard: opened with a pointer, Escape leaves no ring on `⋯`.
	 */
	interface Props {
		items: MoreItem[]
		/** Greys every button but *Keep* while the page writes. */
		busy?: boolean | undefined
		/** Runs with the chosen item's action, after the item's own `onselect`. */
		onselect?: ((action: string) => void) | undefined
	}

	const { items, busy = false, onselect }: Props = $props()

	const uid = $props.id()
	const menuId = `more-menu-${uid}`

	let lang = $state(getLocale())
	const tr = (key: MessageKey) => {
		void lang
		return t(key)
	}

	let open = $state(false)
	/** The item whose question is showing, by action. */
	let asking = $state<string | null>(null)

	let host: HTMLElement | undefined = $state()
	let toggleButton: HTMLButtonElement | undefined = $state()
	/** Whether the menu was opened from the keyboard, so the focus it moves shows the ring. */
	let byKey = true

	const asked = $derived(items.find((item) => item.action === asking))

	/** Renders now, then focuses the button with this `data-action`. */
	function focusAction(action: string | undefined) {
		flushSync()
		if (action === undefined) return
		host?.querySelector<HTMLElement>(`[data-action="${CSS.escape(action)}"]`)?.focus({ focusVisible: byKey })
	}

	/** A click's `detail` counts pointer presses: 0 is a key (Enter, Space) pressing the button. */
	function show(event: MouseEvent) {
		byKey = event.detail === 0
		asking = null
		open = true
		focusAction(items[0]?.action)
	}

	/**
	 * Closes the list and forgets any question. `refocus` hands focus back to `⋯` (Escape, a
	 * choice); a click outside leaves it with whatever was clicked.
	 */
	function close(refocus = true) {
		open = false
		asking = null
		if (refocus) toggleButton?.focus({ focusVisible: byKey })
	}

	function pick(item: MoreItem) {
		if (item.ask) {
			asking = item.action
			focusAction("confirm")
			return
		}
		choose(item)
	}

	function choose(item: MoreItem) {
		close()
		item.onselect?.()
		onselect?.(item.action)
	}

	function keep(item: MoreItem) {
		asking = null
		focusAction(item.action)
	}

	onMount(() => {
		const onKeydown = (event: KeyboardEvent) => {
			if (!open || event.key !== "Escape") return
			event.preventDefault()
			event.stopPropagation()
			close()
		}
		// A click is marked inside as it passes the host, before the item's handler can swap the
		// clicked button out (an item that asks), so the swap does not read as a click outside.
		let inside: Event | null = null
		const onHostClick = (event: Event) => {
			inside = event
		}
		const onDocumentClick = (event: Event) => {
			if (open && event !== inside) close(false)
			inside = null
		}
		host?.addEventListener("click", onHostClick)
		host?.addEventListener("keydown", onKeydown)
		document.addEventListener("click", onDocumentClick)
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		return () => {
			host?.removeEventListener("click", onHostClick)
			host?.removeEventListener("keydown", onKeydown)
			document.removeEventListener("click", onDocumentClick)
			unsubscribe()
		}
	})
</script>

<span class="more-host" bind:this={host}>
	<button
		type="button"
		class="more"
		data-variant="quiet"
		aria-label={tr("common.more")}
		aria-controls={menuId}
		aria-expanded={open ? "true" : "false"}
		bind:this={toggleButton}
		onclick={(event) => (open ? close() : show(event))}>
		⋯
	</button>
	<fieldset class="more-menu" id={menuId} aria-label={tr("common.more")} hidden={!open}>
		{#if asked}
			<span class="ask">{asked.ask}</span>
			<span class="answers">
				<button type="button" data-variant="danger" data-action="confirm" disabled={busy} onclick={() => choose(asked)}>
					{tr("common.delete")}
				</button>
				<button type="button" data-variant="quiet" data-action="keep" onclick={() => keep(asked)}>
					{tr("form.keep")}
				</button>
			</span>
		{:else}
			{#each items as item (item.action)}
				<button
					type="button"
					data-action={item.action}
					data-variant={item.variant ?? "quiet"}
					disabled={busy}
					onclick={() => pick(item)}>
					{item.label}
				</button>
			{/each}
		{/if}
	</fieldset>
</span>

<style>
	/*
	 * Every selector here carries the scope's class besides its own, and the buttons an attribute
	 * too, so they outrank app.css's light-DOM `.page button` rules, which draw the variants.
	 */
	.more-host {
		position: relative;
		display: inline-block;
	}

	.more-host button {
		white-space: nowrap;
	}

	.more-host button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	/* A square icon control, as a sub-header's back and the detail panel's ×. */
	button.more[data-variant] {
		box-sizing: border-box;
		inline-size: var(--cc-control-size);
		block-size: var(--cc-control-size);
		padding: 0;
		font-size: var(--cc-text-md);
		line-height: 1;
	}

	/* A fieldset, so it is named as a group; it keeps none of a fieldset's own frame. */
	.more-menu {
		position: absolute;
		inset-block-start: calc(100% + var(--cc-space-1));
		inset-inline-end: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		box-sizing: border-box;
		min-inline-size: var(--cc-menu-min);
		margin: 0;
		padding: var(--cc-space-2);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
		box-shadow: var(--cc-shadow-lg);
	}

	.more-menu[hidden] {
		display: none;
	}

	.more-menu button[data-variant] {
		align-self: stretch;
		text-align: start;
	}

	.ask {
		padding: var(--cc-space-1) var(--cc-space-2);
		font-size: var(--cc-text-sm);
		font-weight: 600;
	}

	.answers {
		display: flex;
		flex-direction: row;
		gap: var(--cc-space-2);
	}

	.answers button[data-variant] {
		flex: 1 1 0;
		text-align: center;
	}
</style>
