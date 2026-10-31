import { html, LitElement } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { icons } from "#lib/ui/icons";
import { afterExit } from "#lib/ui/motion";
import { payAddress } from "#lib/ui/pay-address";

const MENU_ID = "fab-menu";

/**
 * The floating *+ New* button (DD-104): a speed dial over every page but the list pages and
 * the payment page. Tapping it opens a small menu above it with the two ways to start -- a new
 * purchase list and a payment -- and moves focus to the first. Escape, a tap outside or the
 * button again close it; Escape and the button hand focus back. The menu slides in and out
 * (none of it under prefers-reduced-motion) and hides only once its exit has played.
 *
 * Light DOM, so app.css draws it beside the bars it floats over.
 */
@customElement("cc-fab-menu")
export class CcFabMenu extends LitElement {
	@state() private open = false;

	@query("button.fab") private button!: HTMLButtonElement;
	@query(".fab-menu__list") private menu!: HTMLElement;

	private readonly onDocumentClick = (event: Event) => {
		if (this.open && !event.composedPath().includes(this)) this.close(false);
	};

	constructor() {
		super();
		new LocaleController(this);
	}

	protected override createRenderRoot() {
		return this;
	}

	override connectedCallback() {
		super.connectedCallback();
		this.ownerDocument.addEventListener("click", this.onDocumentClick);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		this.ownerDocument.removeEventListener("click", this.onDocumentClick);
	}

	private items(): HTMLElement[] {
		return [...this.menu.querySelectorAll<HTMLElement>(".fab-menu__item")];
	}

	private async show() {
		this.menu.removeAttribute("data-state");
		this.open = true;
		await this.updateComplete;
		this.items()[0]?.focus();
	}

	/** Plays the menu's exit, then hides it; `refocus` hands focus back to the button. */
	private close(refocus: boolean) {
		if (!this.open || this.menu.getAttribute("data-state") === "closing")
			return;
		this.menu.setAttribute("data-state", "closing");
		this.button.setAttribute("aria-expanded", "false");
		afterExit(this.menu, () => {
			this.menu.removeAttribute("data-state");
			this.open = false;
			if (refocus) this.button.focus();
		});
	}

	private onKeydown(event: KeyboardEvent) {
		if (!this.open) return;
		if (event.key === "Escape") {
			event.preventDefault();
			this.close(true);
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		const items = this.items();
		if (items.length === 0) return;
		event.preventDefault();
		const at = items.indexOf(document.activeElement as HTMLElement);
		const step = event.key === "ArrowDown" ? 1 : -1;
		const next = at < 0 ? 0 : (at + step + items.length) % items.length;
		items[next]?.focus();
	}

	override render() {
		const expanded =
			this.open && this.menu?.getAttribute("data-state") !== "closing";
		return html`<div class="fab-menu__wrap" @keydown=${(e: KeyboardEvent) => this.onKeydown(e)}
			@focusout=${(e: FocusEvent) => {
				const next = e.relatedTarget as Node | null;
				if (next && !this.contains(next)) this.close(false);
			}}>
			<div class="fab-menu__list" id=${MENU_ID} ?hidden=${!this.open}>
				<a class="fab-menu__item" data-action="new-list" href="/list/new"
					>${icons.list}<span>${t("fab.newList")}</span></a
				>
				<a class="fab-menu__item" data-action="pay" href=${payAddress()}
					>${icons.wallet}<span>${t("fab.pay")}</span></a
				>
			</div>
			<button type="button" class="fab" aria-label=${t("fab.new")}
				aria-controls=${MENU_ID} aria-expanded=${expanded ? "true" : "false"}
				@click=${() => (this.open ? this.close(true) : void this.show())}
				><span class="fab__plus">${icons.plus}</span><span class="fab__label">${t("fab.new")}</span></button
			>
		</div>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-fab-menu": CcFabMenu;
	}
}
