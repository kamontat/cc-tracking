<script lang="ts">
	import type { RangePreset } from "#lib/domain/purchase-range"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { getLocale, subscribe, t } from "#lib/i18n/index"

	const RANGES: RangePreset[] = ["today", "week", "month", "lastMonth", "custom"]

	type Range = { range: RangePreset | ""; from: string; to: string }

	/**
	 * A filter sheet's *Date* section: the range presets as pill chips (the picked one taps off),
	 * and from and to under them for a custom range. A preset other than custom clears from and
	 * to. Each change goes to `onchange` as a patch of `range`, `from` and `to`.
	 */
	interface Props extends Range {
		onchange: (patch: Partial<Range>) => void
	}

	const { range, from, to, onchange }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const pick = (preset: RangePreset) => {
		const next = range === preset ? "" : preset
		onchange(next === "custom" ? { range: next } : { range: next, from: "", to: "" })
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<fieldset class="filter-group">
	<legend>{tr("tx.filter.date")}</legend>
	<div class="filter-chips">
		{#each RANGES as preset (preset)}
			<button
				type="button"
				data-variant="quiet"
				data-range={preset}
				aria-pressed={range === preset ? "true" : "false"}
				onclick={() => pick(preset)}>
				{tr(`tx.range.${preset}`)}
			</button>
		{/each}
	</div>
	{#if range === "custom"}
		<div class="filter-dates">
			<label
				>{tr("tx.filter.from")}
				<input
					type="date"
					name="from"
					value={from}
					oninput={(event) => onchange({ from: event.currentTarget.value })}></label
			>
			<label
				>{tr("tx.filter.to")}
				<input type="date" name="to" value={to} oninput={(event) => onchange({ to: event.currentTarget.value })}></label
			>
		</div>
	{/if}
</fieldset>
