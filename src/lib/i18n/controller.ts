import type { ReactiveController, ReactiveControllerHost } from "lit";
import { subscribe } from "#lib/i18n/index";

/**
 * Re-renders its host when the language changes.
 *
 * A component reads `t(...)` during `render`, so Lit has no way to know a locale change
 * affects it — nothing the component owns has changed. This closes that gap without
 * reloading the page, which would discard a half-filled form.
 */
export class LocaleController implements ReactiveController {
	private unsubscribe: (() => void) | null = null;

	constructor(private readonly host: ReactiveControllerHost) {
		host.addController(this);
	}

	hostConnected(): void {
		this.unsubscribe = subscribe(() => this.host.requestUpdate());
	}

	hostDisconnected(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}
}
