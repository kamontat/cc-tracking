<script lang="ts">
	import type { Card, LimitGroup, PlainDate, Purchase } from "#lib/domain/types"
	import type { MessageKey } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import Sheet from "#components/molecules/Sheet.svelte"
	import PurchaseForm from "#components/organisms/PurchaseForm.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * A purchase in a sheet on the card page: `PurchaseForm` (the card fixed and named, then its
	 * date, amount and note) under the sheet's heading, *Add purchase* or *Edit purchase*. *Save*
	 * calls `onsave` with the purchase at once, the sheet staying up until the page takes it away;
	 * Close, Escape and the backdrop call `onclose` once the exit has played, and do nothing while
	 * a save is under way.
	 */
	interface Props {
		/** The card the purchase is on; it is shown, never picked. */
		card: Card | null
		/** Every stored group, for the card chip's pastel. */
		groups: LimitGroup[]
		/** The purchase to edit; null adds a new one. */
		purchase: Purchase | null
		/** The clock a new purchase's `addedAt` is read from. */
		now?: () => Date
		today: PlainDate
		/** Why the last save failed, already in the reader's language; typing is kept. */
		error: string
		/** A save is under way: the button waits and the sheet holds open. */
		busy: boolean
		onsave: (purchase: Purchase) => void
		onclose: () => void
	}

	const { card, groups, purchase, now, today, error, busy, onsave, onclose }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey) => {
		void lang
		return t(key)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<Sheet heading={tr(purchase === null ? "card.purchase.add" : "card.purchase.edit")} held={busy} {onclose}>
	<PurchaseForm {card} {groups} {purchase} {now} {today} {error} {busy} {onsave} />
</Sheet>
