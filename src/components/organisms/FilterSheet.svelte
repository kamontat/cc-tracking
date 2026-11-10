<script lang="ts">
	import type { Snippet } from "svelte"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import Sheet from "#components/molecules/Sheet.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The frame every filter sheet shares (Cards, the ledger, the Lists view, the new-list picker):
	 * the sheet under `heading`, the page's sections (`children`: `FilterChips`, `CardChoices`,
	 * `DateRangeChoices` and the like), then *Clear all* and the apply button, which reads `label`
	 * and is disabled while the draft would show nothing. The page keeps the draft: *Clear all*
	 * calls `onclear`, and apply slides the sheet away before it calls `onapply`. Close, Escape
	 * and the backdrop call `onclose`.
	 */
	interface Props {
		heading: string
		/** How many the draft would show; none disables the apply button. */
		shown: number
		/** The apply button's words, such as *Show 5 results* or *Nothing matches*. */
		label: string
		onclear: () => void
		/** Called once the sheet has slid away; the page applies its draft and takes the sheet off screen. */
		onapply: () => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
		children: Snippet
	}

	const { heading, shown, label, onclear, onapply, onclose, children }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let sheet: { leave: (then: () => void) => void } | undefined = $state()

	const apply = () => {
		if (sheet) sheet.leave(onapply)
		else onapply()
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<Sheet bind:this={sheet} {heading} {onclose}>
	{@render children()}
	<div class="filter-footer">
		<button type="button" data-variant="quiet" data-action="clear" onclick={onclear}>{tr("tx.filter.clear")}</button>
		<button type="button" data-action="apply" disabled={shown === 0} onclick={apply}>{label}</button>
	</div>
</Sheet>
