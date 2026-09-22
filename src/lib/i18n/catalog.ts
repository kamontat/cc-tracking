import type { en } from "#lib/i18n/en";

export type Locale = "en" | "th";

export type MessageKey = keyof typeof en;

/** Every catalog holds exactly the English key set. A missing key is a type error. */
export type Catalog = Record<MessageKey, string>;

export type Params = Record<string, string | number>;
