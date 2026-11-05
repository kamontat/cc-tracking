const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

/** The minus sign (U+2212) a signed amount reads with, not the hyphen. */
export const MINUS = "−"

/** Parse user-typed THB into satang. Throws RangeError on anything that is not a positive amount. */
export function parseAmount(input: string): number {
	const cleaned = input.trim().replace(/,/g, "")
	if (!AMOUNT_PATTERN.test(cleaned)) {
		throw new RangeError(`Not an amount: ${input}`)
	}
	const [baht, satang = ""] = cleaned.split(".")
	const value = Number(baht) * 100 + Number(satang.padEnd(2, "0"))
	if (value <= 0) throw new RangeError("Amount must be greater than zero")
	return value
}

/** `parseAmount`, but null on anything that is not an amount instead of throwing. */
export function amountOf(input: string): number | null {
	try {
		return parseAmount(input)
	} catch {
		return null
	}
}

/** Satang as `฿1,234.56`; a negative amount takes the minus sign: `−฿21,065.00`. */
export function formatAmount(satang: number): string {
	const sign = satang < 0 ? MINUS : ""
	const absolute = Math.abs(satang)
	const baht = Math.floor(absolute / 100).toLocaleString("en-US")
	return `${sign}฿${baht}.${String(absolute % 100).padStart(2, "0")}`
}

/**
 * The inverse of `parseAmount`: satang as plain baht text for an `<input>` -- no currency
 * symbol, no thousands separator -- since `parseAmount` reads the same field back.
 */
export function formatAmountInput(satang: number): string {
	const sign = satang < 0 ? "-" : ""
	const absolute = Math.abs(satang)
	const baht = Math.floor(absolute / 100)
	const remainder = absolute % 100
	return remainder === 0 ? `${sign}${baht}` : `${sign}${baht}.${String(remainder).padStart(2, "0")}`
}

export function sumAmounts(values: number[]): number {
	return values.reduce((total, value) => total + value, 0)
}
