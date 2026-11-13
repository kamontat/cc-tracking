<script lang="ts">
	import type { PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { listPageAddress } from "#lib/ui/list-address"
	import { LISTS_ADDRESS } from "#lib/ui/tx-query"

	/**
	 * A list page opened on a list it does not show: an id that is not stored says so and leads to
	 * the Lists tab; a list in another state says which and leads to where it is now: a draft or a
	 * waiting list to its edit page, a saved list to its panel (RD-26).
	 */
	interface Props {
		list: PurchaseList | undefined
		/** The page's banner text, already in the reader's language. */
		error: string
		onretry: () => void
	}

	const { list, error, onretry }: Props = $props()

	const ELSEWHERE: Record<PurchaseList["status"], { says: MessageKey; open: MessageKey }> = {
		draft: { says: "purchaseList.isDraft", open: "purchaseList.openDraft" },
		sent: { says: "purchaseList.isSent", open: "purchaseList.openReply" },
		saved: { says: "purchaseList.isSaved", open: "purchaseList.openSaved" },
	}

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<SubHeaderBar title={tr("purchaseList.title")} back={LISTS_ADDRESS} />
<ErrorBanner message={error} retryLabel={tr("common.reload")} {onretry} />
{#if list}
	<p class="placeholder">{tr(ELSEWHERE[list.status].says)}</p>
	<a data-action="open-list" href={listPageAddress(list)}>{tr(ELSEWHERE[list.status].open)}</a>
{:else}
	<p class="placeholder">{tr("purchaseList.missing")}</p>
	<a href={LISTS_ADDRESS}>{tr("purchaseList.toLists")}</a>
{/if}
