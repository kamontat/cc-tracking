<script lang="ts">
	import type { Snippet } from "svelte"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { SheetTab } from "#lib/ui/sheet-tab"

	import { onMount } from "svelte"

	import Sheet from "#components/molecules/Sheet.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { SHEET_TABS } from "#lib/ui/sheet-tab"

	/**
	 * The frame every filter sheet shares (Cards, the ledger, the Lists view):
	 * the sheet under `heading`, then tabs (DD-194) for *Filter*, *Sort* and *Group* over their
	 * panels (`filterPart`, `sortPart`, `groupPart`; a part left out has no tab), then *Clear all* and the apply
	 * button, which reads `label` and is disabled while the draft would show nothing. It opens on
	 * `tab` (the control that opened it), and the hidden panels stay in the page, so a draft and a
	 * card find keep their state across tabs. The tabs are the WAI-ARIA tabs pattern: one tab stop,
	 * the arrow keys, Home and End move and choose. The page keeps the draft: *Clear all* calls
	 * `onclear`, and apply slides the sheet away before it calls `onapply`. Close, Escape and the
	 * backdrop call `onclose`.
	 */
	interface Props {
		heading: string
		/** The tab to open on; Filter when absent, or the first part there is when that part is left out. */
		tab?: SheetTab
		/** How many the draft would show; none disables the apply button. */
		shown: number
		/** The apply button's words, such as *Show 5 results* or *Nothing matches*. */
		label: string
		onclear: () => void
		/** Called once the sheet has slid away; the page applies its draft and takes the sheet off screen. */
		onapply: () => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
		/** The *Filter* tab's sections; none, no Filter tab (a tab with only a sort). */
		filterPart?: Snippet
		/** The *Sort* tab's section; none, no Sort tab. */
		sortPart?: Snippet
		/** The *Group* tab's section; none, no Group tab. */
		groupPart?: Snippet
	}

	const {
		heading,
		tab = "filter",
		shown,
		label,
		onclear,
		onapply,
		onclose,
		filterPart,
		sortPart,
		groupPart,
	}: Props = $props()

	const uid = $props.id()
	const parts = $derived({ filter: filterPart, sort: sortPart, group: groupPart })
	const tabs = $derived(SHEET_TABS.filter((name) => parts[name] !== undefined))

	// svelte-ignore state_referenced_locally
	let current = $state<SheetTab>(tab)
	const active = $derived(tabs.includes(current) ? current : (tabs[0] ?? "filter"))

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let sheet: { leave: (then: () => void) => void } | undefined = $state()
	let list: HTMLElement | undefined = $state()

	const apply = () => {
		if (sheet) sheet.leave(onapply)
		else onapply()
	}

	/** Chooses a tab and moves focus to it, as the arrow keys, Home and End do. */
	const choose = (name: SheetTab) => {
		current = name
		list?.querySelector<HTMLElement>(`[role=tab][data-tab="${name}"]`)?.focus()
	}

	const onkeydown = (event: KeyboardEvent) => {
		const at = tabs.indexOf(active)
		const next =
			event.key === "ArrowRight"
				? tabs[(at + 1) % tabs.length]
				: event.key === "ArrowLeft"
					? tabs[(at - 1 + tabs.length) % tabs.length]
					: event.key === "Home"
						? tabs[0]
						: event.key === "End"
							? tabs.at(-1)
							: undefined
		if (!next) return
		event.preventDefault()
		choose(next)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<Sheet bind:this={sheet} {heading} {onclose}>
	{#if tabs.length > 1}
		<div class="filter-tabs" role="tablist" aria-label={heading} bind:this={list}>
			{#each tabs as name (name)}
				<button
					type="button"
					role="tab"
					id={`${uid}-tab-${name}`}
					data-tab={name}
					aria-selected={active === name ? "true" : "false"}
					aria-controls={`${uid}-panel-${name}`}
					tabindex={active === name ? 0 : -1}
					onclick={() => {
						current = name
					}}
					{onkeydown}>
					{tr(`filter.tab.${name}`)}
				</button>
			{/each}
		</div>
	{/if}
	{#each tabs as name (name)}
		{@const part = parts[name]}
		<div
			class="filter-panel"
			role="tabpanel"
			id={`${uid}-panel-${name}`}
			data-tab={name}
			aria-labelledby={`${uid}-tab-${name}`}
			hidden={active !== name}>
			{@render part?.()}
		</div>
	{/each}
	<div class="filter-footer">
		<button type="button" data-variant="quiet" data-action="clear" onclick={onclear}>{tr("tx.filter.clear")}</button>
		<button type="button" data-action="apply" disabled={shown === 0} onclick={apply}>{label}</button>
	</div>
</Sheet>
