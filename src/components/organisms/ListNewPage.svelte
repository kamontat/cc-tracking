<script lang="ts">
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { ShareApi } from "#lib/ui/list-share"
	import type { Opened } from "#lib/ui/startup"

	import ListEntryPage from "#components/organisms/ListEntryPage.svelte"
	import ListPickerPage from "#components/organisms/ListPickerPage.svelte"
	import { browserBar } from "#lib/ui/address-bar"
	import { namesCards } from "#lib/ui/ready-query"

	/**
	 * A new purchase list (`/list/new`). With no `card` in the address it is the picker, *Ready to
	 * use* in full (DD-103); `?card=<id>`, once per card, enters the amounts for the cards picked
	 * there. The address is read once: the picker leaves for the entering step with a new load.
	 */
	interface Props {
		open?: () => Promise<Opened>
		clock?: () => Date
		address?: AddressBar
		navigate?: (url: string) => void
		share?: ShareApi
		newId?: () => string
	}

	const { address = browserBar(), ...rest }: Props = $props()

	const entering = namesCards(address.search())
</script>

{#if entering}
	<ListEntryPage mode="new" {address} {...rest} />
{:else}
	<ListPickerPage {address} {...rest} />
{/if}
