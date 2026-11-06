import type { MessageKey } from "#lib/i18n/catalog"
import type { IconName } from "#lib/ui/icon-paths"

export type Tab = "home" | "transactions" | "cards" | "settings"

/** The four places, in the order both navs show them, each with its address, label and icon. */
export const TABS: readonly { tab: Tab; href: string; label: MessageKey; icon: IconName }[] = [
	{ tab: "home", href: "/", label: "nav.home", icon: "home" },
	{ tab: "transactions", href: "/transactions", label: "nav.transactions", icon: "transactions" },
	{ tab: "cards", href: "/cards", label: "nav.cards", icon: "cards" },
	{ tab: "settings", href: "/settings", label: "nav.settings", icon: "settings" },
]
