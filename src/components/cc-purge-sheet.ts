import "#components/cc-modal"
import type { PurgeAge } from "#lib/domain/purge"
import type { PlainDate } from "#lib/domain/types"
import type { Repository } from "#lib/storage/repository"

import { css, html, LitElement, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js"

import { sheetChip } from "#components/filter-sheet"
import { displayDate } from "#lib/domain/date"
import { LocaleController } from "#lib/i18n/controller"
import { messageOf } from "#lib/i18n/error"
import { getLocale, t } from "#lib/i18n/index"
import { applyPurge, previewPurge } from "#lib/storage/purge-run"
import { base, controls, filterSheet } from "#styles/shared"

/** What `purged` carries: how many purchases went, and the age they were older than. */
export type PurgedDetail = { count: number; age: PurgeAge }

const AGES: PurgeAge[] = ["6m", "1y", "3y", "all"]

type Preview = Awaited<ReturnType<typeof previewPurge>>

/**
 * *Delete old purchases* (RD-18), in a sheet. Chips pick how old (a year by default) and each
 * choice recounts; a note says how many purchases go and before which date, and how many older
 * ones stay because their statement is not fully paid. *Delete N purchases...* swaps to a
 * second ask, *Keep them* or *Yes, delete N*. Yes writes the plan, lets the sheet slide away
 * and emits `purged` (`PurgedDetail`); the buttons stay held until the page takes the sheet
 * away. Close, Escape and the backdrop emit `close`.
 */
@customElement("cc-purge-sheet")
export class CcPurgeSheet extends LitElement {
	static override styles = [
		base,
		controls,
		filterSheet,
		css`
			.body {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.note {
				margin: 0;
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}

			.note[data-tone="warn"] {
				color: var(--cc-warning);
				background: var(--cc-warning-surface);
			}

			.note[data-tone="bad"] {
				color: var(--cc-danger);
				background: var(--cc-danger-surface);
			}

			.muted {
				margin: 0;
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.body > button {
				padding: var(--cc-space-3);
				font-size: var(--cc-text-md);
				font-weight: 650;
			}

			.pair {
				display: flex;
				flex-direction: row;
				gap: var(--cc-space-2);
			}

			.pair button {
				flex: 1 1 0;
				padding-block: var(--cc-space-3);
				font-size: var(--cc-text-md);
				font-weight: 650;
			}
		`,
	]

	@property({ attribute: false }) repo!: Repository
	/** The day the cutoff counts back from. */
	@property() today: PlainDate = ""

	@state() private age: PurgeAge = "1y"
	/** What the chosen age would remove; null while it is being counted. */
	@state() private preview: Preview | null = null
	@state() private asking = false
	/** Why the write failed, kept raw so a language switch re-translates it. */
	@state() private failure: unknown = null
	/** A count or write is under way, or the sheet is leaving: buttons wait and it holds open. */
	@state() private busy = false

	constructor() {
		super()
		new LocaleController(this)
	}

	override connectedCallback() {
		super.connectedCallback()
		void this.recount()
	}

	/** Counts what the current age would remove; an answer for an age since left is dropped. */
	private async recount() {
		const age = this.age
		this.preview = null
		try {
			const preview = await previewPurge(this.repo, age, this.today)
			if (age === this.age) this.preview = preview
		} catch (failure) {
			if (age === this.age) this.failure = failure
		}
	}

	private choose(age: PurgeAge) {
		if (this.busy || age === this.age) return
		this.age = age
		this.asking = false
		this.failure = null
		void this.recount()
	}

	private async apply(preview: Preview) {
		if (this.busy) return
		this.busy = true
		this.failure = null
		try {
			await applyPurge(this.repo, preview.plan)
		} catch (failure) {
			// Some purchases may have gone before the failure: count again, so a retry offers
			// what is there now, and only then let the buttons go.
			this.asking = false
			await this.recount()
			this.failure = failure
			this.busy = false
			return
		}
		// Busy stays on: the sheet is going, and a second apply must not start meanwhile.
		const detail: PurgedDetail = {
			count: preview.plan.purchaseIds.length,
			age: this.age,
		}
		const emit = () => this.dispatchEvent(new CustomEvent<PurgedDetail>("purged", { detail }))
		const sheet = this.renderRoot.querySelector("cc-modal")
		if (sheet) sheet.leave(emit)
		else emit()
	}

	private footer(preview: Preview | null) {
		const count = preview?.plan.purchaseIds.length ?? 0
		if (this.asking && count > 0 && preview) {
			return html`<p class="note" data-tone="bad">${t("purge.sure")}</p>
				<div class="pair">
					<button type="button" data-action="keep" ?disabled=${this.busy}
						@click=${() => {
							this.asking = false
						}}>${t("purge.keep")}</button>
					<button type="button" data-variant="danger" data-action="yes"
						?disabled=${this.busy} @click=${() => this.apply(preview)}>${t(
							count === 1 ? "purge.yes.one" : "purge.yes.many",
							{ count },
						)}</button>
				</div>`
		}
		return html`<button type="button" data-variant="danger" data-action="ask"
			?disabled=${this.busy || count === 0}
			@click=${() => {
				this.asking = true
			}}>${
				preview === null
					? t("purge.counting")
					: count === 0
						? t("purge.nothing")
						: t(count === 1 ? "purge.ask.one" : "purge.ask.many", { count })
			}</button>`
	}

	private notes(preview: Preview | null) {
		if (!preview) return nothing
		const count = preview.plan.purchaseIds.length
		const stay = preview.older - count
		return html`<p class="note" data-tone=${count > 0 ? "warn" : nothing}>${
			count === 0
				? t("purge.none", { age: t(`purge.span.${this.age}`) })
				: t(count === 1 ? "purge.note.one" : "purge.note.many", {
						count,
						date: displayDate(preview.cutoff, getLocale()),
					})
		}</p>
		${
			stay > 0
				? html`<p class="muted" data-note="stay">${t(stay === 1 ? "purge.stay.one" : "purge.stay.many", {
						count: stay,
					})}</p>`
				: nothing
		}`
	}

	override render() {
		return html`<cc-modal sheet .held=${this.busy} heading=${t("settings.reset.purge")}
			@close=${(event: Event) => {
				event.stopPropagation()
				this.dispatchEvent(new CustomEvent("close"))
			}}>
			<div class="body">
				<fieldset>
					<legend>${t("purge.older")}</legend>
					<div class="choices">${AGES.map((age) =>
						sheetChip("age", age, t(`purge.age.${age}`), this.age === age, () => this.choose(age)),
					)}</div>
				</fieldset>
				${this.notes(this.preview)}
				<p class="muted">${t("purge.explain")}</p>
				${
					this.failure === null
						? nothing
						: html`<p role="alert" class="note" data-tone="bad">${messageOf(this.failure, "purge.error")}</p>`
				}
				${this.footer(this.preview)}
			</div>
		</cc-modal>`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-purge-sheet": CcPurgeSheet
	}
}
