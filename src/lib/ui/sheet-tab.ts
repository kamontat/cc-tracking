/** A filter sheet's tabs (DD-194): what narrows the list, its order, and its sections. */
export type SheetTab = "filter" | "sort" | "group"

export const SHEET_TABS: readonly SheetTab[] = ["filter", "sort", "group"]
