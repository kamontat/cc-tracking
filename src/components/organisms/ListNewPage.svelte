<script lang="ts">
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { ShareApi } from "#lib/ui/list-share"
	import type { Opened } from "#lib/ui/startup"

	import ListEntryPage from "#components/organisms/ListEntryPage.svelte"

	/**
	 * A new purchase list (`/list/new`): the list itself, empty or holding the address's `card`
	 * parameters, with cards added from the add-a-card sheet (DD-195). The picker that came first
	 * is gone; its search and sorts live in the sheet.
	 */
	interface Props {
		open?: () => Promise<Opened>
		clock?: () => Date
		address?: AddressBar
		navigate?: (url: string) => void
		share?: ShareApi
		newId?: () => string
	}

	const props: Props = $props()
</script>

<ListEntryPage mode="new" {...props} />
