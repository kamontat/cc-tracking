import { mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import SvgIcon from "#components/atoms/SvgIcon.svelte"
import { ICON_PATHS } from "#lib/ui/icon-paths"

let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

test("draws the named icon, hidden from assistive technology", () => {
	mounted = mount(SvgIcon, { target: document.body, props: { name: "plus" } })
	const svg = document.body.querySelector("svg.icon")
	expect(svg?.getAttribute("aria-hidden")).toBe("true")
	expect(svg?.getAttribute("focusable")).toBe("false")
	expect(svg?.innerHTML).toContain(ICON_PATHS.plus.slice(0, 20))
})
