import type { AddressBar } from "#lib/ui/address-bar"

import { isCardId } from "#lib/domain/card"
import { t } from "#lib/i18n/index"

/*
 * The detail panel's address and history (PRD RD-23, RD-24, DD-196), shared by every page that
 * opens a record beside its list. The panel itself is the `DetailPanel` molecule; what it holds
 * is an organism per kind (`CardPanel`, and later the limit and list panels). This module only
 * knows which record is open, what is being done in it, and how each step moves through history:
 *
 * - The address names the open record by kind (`?card=<id>`, `?limit=<id>`, `?list=<id>`), never
 *   a form inside it. When a page takes more than one key, `card` wins. Settings' panels
 *   (`?panel=locations`, `?panel=owners`) are named the same way, the panel's name as its id.
 * - Opening a record from nothing pushes an entry, so Back closes it; showing another one from
 *   the list rewrites that entry; going deeper (a group's card) pushes.
 * - A form (`openForm`) pushes an entry with the address unchanged, so Back returns to the
 *   record; a reload shows the record. `back` (‹, Cancel, a save) steps back over the form's
 *   entry, or swaps the record's summary back in place when there is none under it.
 * - A blank form (`blank`, *+ Add card*) opens with the address unchanged; `created` writes the
 *   new record's address over its entry.
 * - `close` (×, Escape, the backdrop, a swipe) steps back over every entry the panel pushed, or
 *   rewrites a pasted address without the record.
 * - Once a field in a form changed (`touch`), showing another record, a blank form and `close`
 *   ask first (_Discard your changes?_); Back leaves without asking.
 *
 * History holds no state of ours: the entries are told apart in memory, and a pop is placed by
 * the address it lands on (Back first, then Forward), so an address this panel did not make is
 * read as it is.
 */

/** The kinds of record with a panel, in the order their keys win (`card` first); `panel` is Settings'. */
export const RECORD_KINDS = ["card", "limit", "list", "panel"] as const

export type RecordKind = (typeof RECORD_KINDS)[number]

/** A record by kind and id, as the address names it. */
export type RecordRef = { kind: RecordKind; id: string }

/** What is open inside a panel instead of the record's summary, by name (`edit`, `pay`, `new`). */
export type PanelForm = { name: string; arg?: string }

/** What the panel shows: a record (or, for a blank form, its kind alone) and any form over it. */
export type PanelView = { kind: RecordKind; id: string | null; form: PanelForm | null }

/** Whether `id` can name a record of `kind`: a card id in its format (`isCardId`, RD-28); any other, not empty. */
export const isRecordId = (kind: RecordKind, id: string): boolean => (kind === "card" ? isCardId(id) : id !== "")

/**
 * The record the query names among the `kinds` a page takes, `card` winning; an empty or invalid
 * id opens nothing.
 */
export function readRecord(search: string, kinds: readonly RecordKind[] = RECORD_KINDS): RecordRef | null {
	const params = new URLSearchParams(search)
	for (const kind of RECORD_KINDS) {
		if (!kinds.includes(kind)) continue
		const id = params.get(kind)
		if (id !== null && id !== "") return isRecordId(kind, id) ? { kind, id } : null
	}
	return null
}

/** `url` with every record key taken out, and `ref`'s set after the page's own keys. */
export function withRecord(url: string, ref: RecordRef | null): string {
	const at = url.indexOf("?")
	const path = at === -1 ? url : url.slice(0, at)
	const params = new URLSearchParams(at === -1 ? "" : url.slice(at))
	for (const kind of RECORD_KINDS) params.delete(kind)
	if (ref) params.set(ref.kind, ref.id)
	const query = params.toString()
	return query ? `${path}?${query}` : path
}

const refOf = (view: PanelView | null): RecordRef | null =>
	view && view.id !== null ? { kind: view.kind, id: view.id } : null

const sameRef = (a: RecordRef | null, b: RecordRef | null) =>
	a === null || b === null ? a === b : a.kind === b.kind && a.id === b.id

export type RecordPanelOptions = {
	/** The page's address bar, shared with the page so both see the same entries. */
	address: AddressBar
	/** The page's path, which every address the panel writes keeps (`/cards`). */
	path: string
	/** The record keys this page reads; another kind's key is left alone. */
	kinds?: readonly RecordKind[]
	/** Asked before a changed form is dropped; true lets it go. */
	ask?: () => boolean
}

export class RecordPanel {
	/** What the panel shows; null when it is closed. */
	view = $state.raw<PanelView | null>(null)
	/** Whether a field in the open form changed since it opened. */
	dirty = $state(false)

	readonly #address: AddressBar
	readonly #path: string
	readonly #kinds: readonly RecordKind[]
	readonly #ask: () => boolean
	/** The entries since the page started, as the panel saw them, and the one showing. */
	#entries: (PanelView | null)[] = [null]
	#at = 0
	/** Where a move the panel asked for (`go`) lands, and what to do once it has. */
	#landing: { at: number; then?: () => void } | null = null

	constructor(options: RecordPanelOptions) {
		this.#address = options.address
		this.#path = options.path
		this.#kinds = options.kinds ?? RECORD_KINDS
		this.#ask = options.ask ?? (() => globalThis.confirm(t("panel.discardAsk")))
		this.#reset()
	}

	/** Whether a panel is showing. */
	get open(): boolean {
		return this.view !== null
	}

	/** The open record, when it has an id (a blank form has none). */
	get record(): RecordRef | null {
		return refOf(this.view)
	}

	/**
	 * Reads the address and follows Back and Forward from now on; call it in `onMount` and return
	 * its remover. The page's own list keys are the page's to read on the same pops.
	 */
	start(): () => void {
		this.#reset()
		return this.#address.onPop(() => this.#popped(), { ownPage: true })
	}

	/** `url`, an address the page is about to write, with the open record's key kept in it. */
	keep(url: string): string {
		return withRecord(url, this.record)
	}

	/**
	 * Shows `ref` from the list (a tile, a row): pushes when nothing is open, else rewrites the
	 * entry. With `form` it opens straight on that form (_Pay_ on a bill), whose ‹ then swaps the
	 * record in place. Asks first when a changed form would go.
	 */
	show(ref: RecordRef, form: PanelForm | null = null): void {
		const view: PanelView = { ...ref, form }
		if (this.open && sameRef(this.record, ref) && !this.view?.form && !form) return
		if (!this.#mayLeave()) return
		if (this.open) this.#replace(view)
		else this.#push(view)
	}

	/** Goes deeper to another record from inside the panel (a group's card): pushes, so Back returns. */
	deeper(ref: RecordRef, form: PanelForm | null = null): void {
		if (!this.#mayLeave()) return
		this.#push({ ...ref, form })
	}

	/** Opens a form over the open record: pushes an entry with the address unchanged. */
	openForm(form: PanelForm): void {
		const view = this.view
		if (!view || view.id === null) return
		this.#push({ ...view, form })
	}

	/**
	 * Opens a blank form for a new record of `kind` (_+ Add card_), the address unchanged: pushed
	 * when nothing is open, else over the open record's entry, without its key.
	 */
	blank(kind: RecordKind, form: PanelForm = { name: "new" }): void {
		if (!this.#mayLeave()) return
		const view: PanelView = { kind, id: null, form }
		if (this.open) this.#replace(view)
		else this.#push(view)
	}

	/**
	 * Back to the record from its form (‹, _Cancel_, a save): a step back over the form's entry,
	 * or, when the record's own entry is not under it, the summary swapped in place. Never asks.
	 */
	back(): void {
		const view = this.view
		if (!view?.form || view.id === null) return
		this.dirty = false
		const below = this.#entries[this.#at - 1]
		if (below && !below.form && sameRef(refOf(below), refOf(view))) this.#go(-1)
		else this.#replace({ ...view, form: null })
	}

	/**
	 * Closes the panel (×, Escape, the backdrop, a swipe): steps back over every entry it pushed, or
	 * rewrites a pasted address without the record. `ask: false` for a write's own close (a delete).
	 */
	close({ ask = true }: { ask?: boolean } = {}): void {
		if (!this.open) return
		if (ask && !this.#mayLeave()) return
		this.dirty = false
		let target = this.#at
		while (target > 0 && this.#entries[target] !== null) target--
		if (this.#entries[target] === null) {
			this.#go(target - this.#at)
			return
		}
		// Opened on a pasted address: nothing of ours under it, so it is rewritten.
		const rewrite = () => this.#replace(null)
		if (this.#at === 0) rewrite()
		else this.#go(-this.#at, rewrite)
	}

	/** A new record is stored: its address is written over the blank form's entry. */
	created(ref: RecordRef): void {
		this.dirty = false
		this.#replace({ ...ref, form: null })
	}

	/** The address names a record that is not stored: nothing opens, and its key goes. */
	drop(): void {
		if (!this.open) return
		this.dirty = false
		this.#replace(null)
	}

	/** A field in the open form changed; nothing to keep in a record's summary. */
	touch(): void {
		if (this.view?.form) this.dirty = true
	}

	#mayLeave(): boolean {
		return !this.dirty || this.#ask()
	}

	#url(view: PanelView | null): string {
		return withRecord(`${this.#path}${this.#address.search()}`, refOf(view))
	}

	#set(view: PanelView | null) {
		this.view = view
		this.dirty = false
	}

	#push(view: PanelView) {
		this.#address.push(this.#url(view), { ownPage: true })
		this.#entries.splice(this.#at + 1, this.#entries.length, view)
		this.#at++
		this.#set(view)
	}

	#replace(view: PanelView | null) {
		this.#address.replace(this.#url(view))
		this.#entries[this.#at] = view
		this.#set(view)
	}

	/** Moves `delta` entries, then runs `then` once landed. */
	#go(delta: number, then?: () => void) {
		this.#landing = then ? { at: this.#at + delta, then } : { at: this.#at + delta }
		const { go } = this.#address
		if (go) go(delta)
		else this.#address.back()
	}

	#reset() {
		const ref = readRecord(this.#address.search(), this.#kinds)
		const view = ref ? { ...ref, form: null } : null
		this.#entries = [view]
		this.#at = 0
		this.#landing = null
		this.#set(view)
	}

	#popped() {
		const landing = this.#landing
		this.#landing = null
		const ref = readRecord(this.#address.search(), this.#kinds)
		const fits = (at: number) => at >= 0 && at < this.#entries.length && sameRef(refOf(this.#entries[at] ?? null), ref)
		if (landing && fits(landing.at)) this.#at = landing.at
		else if (fits(this.#at - 1)) this.#at--
		else if (fits(this.#at + 1)) this.#at++
		else {
			this.#reset()
			return
		}
		this.#set(this.#entries[this.#at] ?? null)
		landing?.then?.()
	}
}
