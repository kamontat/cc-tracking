<script lang="ts">
	import type { Snippet } from "svelte"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The detail panel (PRD RD-23, DD-196) around whatever record or form is passed in: from 900px a
	 * column beside the list (the page's `.panel-layout` makes room for it), which stays usable;
	 * below 900px a sheet that slides up over the list, with a backdrop. Its head is the `lead`
	 * (a card's chip), the title over a muted `detail` line, the `actions` (_Edit_, a `MoreMenu`),
	 * and ×; with `onback`, a ‹ before the title (a form back to its record).
	 *
	 * The panel opens and closes by being rendered: it never closes itself. ×, Escape, the backdrop
	 * and a swipe down on the head each call `onclose`, and the page decides (`RecordPanel.close`,
	 * which asks first about a changed form). Escape is left alone while a sheet or a menu is open
	 * over the panel. Typing or picking in the body (`input`, `change`, a pressed choice in a form)
	 * calls `ontouch`, so the page knows a form changed. The panel takes focus as it opens. With
	 * `full` (a form is open) the phone's sheet takes the whole height.
	 */
	interface Props {
		/** The record's name, or the form's; it names the panel. */
		title: string
		/** A muted line under the title: the card's id and place. */
		detail?: string | undefined
		/** Before the title: the record's chip. */
		lead?: Snippet | undefined
		/** After the title: the header actions. */
		actions?: Snippet | undefined
		/** Shows ‹ before the title, which runs it: back from a form to its record. */
		onback?: (() => void) | undefined
		/** The ‹'s accessible name; _Back_ when left out. */
		backLabel?: string | undefined
		/** ×, Escape, the backdrop or a swipe down asked to close. */
		onclose: () => void
		/** A field in the body changed. */
		ontouch?: (() => void) | undefined
		/** A form is open: on a phone the sheet takes the screen's full height. */
		full?: boolean | undefined
		children: Snippet
	}

	const { title, detail, lead, actions, onback, backLabel, onclose, ontouch, full = false, children }: Props = $props()

	/** How far down (in CSS pixels) a swipe on the head must travel to close the sheet. */
	const SWIPE_CLOSE = 80

	const uid = $props.id()
	const titleId = `${uid}-title`

	let lang = $state(getLocale())
	const tr = (key: "common.close" | "common.back") => {
		void lang
		return t(key)
	}

	let aside: HTMLElement | undefined = $state()
	let swipeFrom: number | null = null

	/** Whether something drawn over the panel (a sheet, a menu) owns Escape now. */
	const covered = () =>
		document.querySelector("dialog[open]") !== null || document.querySelector(":popover-open") !== null

	const onKey = (event: KeyboardEvent) => {
		if (event.key !== "Escape" || event.defaultPrevented || covered()) return
		onclose()
	}

	const onTouch = (event: Event) => {
		if (event.type === "click") {
			const target = event.target instanceof Element ? event.target.closest("button[aria-pressed]") : null
			if (!target?.closest("form")) return
		}
		ontouch?.()
	}

	/**
	 * Listens on the element for each event named, as an attachment: the backdrop's click (whose
	 * keyboard twin is Escape) and the body's changes, which no control of its own stands for.
	 */
	const listen = (handlers: Record<string, (event: Event) => void>) => (node: HTMLElement) => {
		for (const [type, handler] of Object.entries(handlers)) node.addEventListener(type, handler)
		return () => {
			for (const [type, handler] of Object.entries(handlers)) node.removeEventListener(type, handler)
		}
	}

	const onPointerDown = (event: PointerEvent) => {
		swipeFrom = event.clientY
	}

	const onPointerUp = (event: PointerEvent) => {
		const from = swipeFrom
		swipeFrom = null
		if (from !== null && event.clientY - from >= SWIPE_CLOSE) onclose()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		// Whatever had focus as the panel opened (the tile tapped), to hand it back as it closes.
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
		aside?.focus({ preventScroll: true })
		document.addEventListener("keydown", onKey)
		return () => {
			unsubscribe()
			document.removeEventListener("keydown", onKey)
			if (opener?.isConnected) opener.focus({ preventScroll: true })
		}
	})
</script>

<!-- The backdrop is the sheet's on a phone (hidden from 900px); Escape is its keyboard twin. -->
<div class="detail-panel__backdrop" {@attach listen({ click: onclose })}></div>
<aside
	bind:this={aside}
	class="detail-panel"
	data-full={full ? "" : undefined}
	aria-labelledby={titleId}
	tabindex="-1"
	{@attach listen({ input: onTouch, change: onTouch, click: onTouch })}>
	<div class="detail-panel__head" onpointerdown={onPointerDown} onpointerup={onPointerUp}>
		<span class="detail-panel__grab" aria-hidden="true"></span>
		<div class="detail-panel__bar">
			{#if onback}
				<button
					type="button"
					class="detail-panel__icon"
					data-variant="quiet"
					data-action="panel-back"
					aria-label={backLabel ?? tr("common.back")}
					onclick={onback}>
					<SvgIcon name="back" />
				</button>
			{/if}
			{@render lead?.()}
			<div class="detail-panel__title">
				<h2 id={titleId}>{title}</h2>
				{#if detail}
					<small class="detail-panel__detail">{detail}</small>
				{/if}
			</div>
			{#if actions}
				<div class="detail-panel__actions">{@render actions()}</div>
			{/if}
			<button
				type="button"
				class="detail-panel__icon"
				data-variant="quiet"
				data-action="close-panel"
				aria-label={tr("common.close")}
				onclick={onclose}>
				<SvgIcon name="close" />
			</button>
		</div>
	</div>
	<div class="detail-panel__body">{@render children()}</div>
</aside>

<style>
	/* On a phone: a sheet over the list and the tab bar, with a backdrop under it. */
	.detail-panel__backdrop {
		position: fixed;
		inset: 0;
		z-index: 13;
		background: var(--cc-backdrop);
		animation: detail-fade var(--cc-sheet-motion) var(--cc-sheet-ease);
	}

	.detail-panel {
		position: fixed;
		inset-inline: 0;
		bottom: 0;
		z-index: 14;
		display: flex;
		flex-direction: column;
		block-size: var(--cc-detail-sheet-height);
		overflow: hidden;
		color: var(--cc-text);
		background: var(--cc-bg);
		border-radius: var(--cc-radius-md) var(--cc-radius-md) 0 0;
		box-shadow: var(--cc-shadow-lg);
		outline: none;
		animation: detail-rise var(--cc-sheet-motion) var(--cc-sheet-ease);
	}

	.detail-panel[data-full] {
		block-size: 100dvh;
		border-radius: 0;
	}

	/* The head stays put; the body under it is what scrolls. */
	.detail-panel__head {
		display: flex;
		flex: none;
		flex-direction: column;
		background: var(--cc-bg);
		border-bottom: var(--cc-border-width) solid var(--cc-border);
		touch-action: none;
	}

	.detail-panel__grab {
		display: block;
		align-self: center;
		inline-size: calc(var(--cc-space-7) - var(--cc-space-1));
		block-size: var(--cc-space-1);
		margin-block-start: var(--cc-space-2);
		background: var(--cc-border);
		border-radius: var(--cc-radius-pill);
	}

	.detail-panel__bar {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--cc-space-2);
		padding: var(--cc-space-3) var(--cc-space-4);
	}

	.detail-panel__title {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-inline-size: 0;
	}

	/* Two classes, to outrank app.css's `.page h2` and `.page small`. */
	.detail-panel__title h2 {
		margin: 0;
		overflow: hidden;
		font-size: var(--cc-text-md);
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail-panel__title .detail-panel__detail {
		overflow: hidden;
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.detail-panel__actions {
		display: flex;
		flex-direction: row;
		flex: none;
		align-items: center;
		gap: var(--cc-space-2);
	}

	/* A square icon button, as the sub-header's back control. */
	.detail-panel .detail-panel__icon {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		padding: var(--cc-space-2);
		line-height: 1;
	}

	.detail-panel__icon :global(.icon) {
		inline-size: var(--cc-icon-size);
		block-size: var(--cc-icon-size);
		flex: none;
	}

	/* The panel's one scroller, which keeps a scroll that reaches its end from moving the page. */
	.detail-panel__body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-block-size: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: var(--cc-space-4) var(--cc-space-4) var(--cc-detail-body-end);
	}

	/* From 900px: a column beside the list as tall as the screen leaves it, parked under the
	   header while the list scrolls with the page. */
	@media (min-width: 900px) {
		.detail-panel__backdrop {
			display: none;
		}

		.detail-panel,
		.detail-panel[data-full] {
			position: sticky;
			top: var(--cc-detail-column-top);
			z-index: auto;
			block-size: var(--cc-detail-column-height);
			background: var(--cc-surface);
			border: var(--cc-border-width) solid var(--cc-border);
			border-radius: var(--cc-radius-md);
			box-shadow: none;
			animation-name: detail-slide;
		}

		.detail-panel__head {
			background: var(--cc-surface);
			touch-action: auto;
		}

		.detail-panel__grab {
			display: none;
		}
	}

	@keyframes detail-rise {
		from {
			transform: translateY(100%);
		}
	}

	@keyframes detail-slide {
		from {
			opacity: 0;
			transform: translateX(var(--cc-space-5));
		}
	}

	@keyframes detail-fade {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.detail-panel,
		.detail-panel__backdrop {
			animation: none;
		}
	}
</style>
