/** `values` with `value` added at the end, or taken out when it is there; a filter chip's tap. */
export function toggled<T>(values: readonly T[], value: T): T[] {
	return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}
