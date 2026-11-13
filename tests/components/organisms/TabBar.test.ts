// @vitest-environment node
import { describe, expect, test } from "vitest"

import TabBar from "#components/organisms/TabBar.astro"
import { createContainer, parseHtml } from "../../container"

const render = async (props: { current?: string } = {}) =>
	parseHtml(await (await createContainer()).renderToString(TabBar, { props }))

describe("TabBar", () => {
	test("is the page's tab bar slot: the four tabs, with no add button inside", async () => {
		const doc = await render({ current: "home" })
		const bar = doc.querySelector("#tabbar")
		expect(bar).not.toBeNull()
		expect([...doc.querySelectorAll(".tabbar > *")].map((a) => a.getAttribute("data-tab"))).toEqual([
			"home",
			"transactions",
			"cards",
			"settings",
		])
		expect(doc.querySelector(".tabbar [data-action]")).toBeNull()
		expect(doc.querySelector(".tabbar a")?.getAttribute("aria-current")).toBe("page")
	})

	test("holds the nav alone: the floating + New retired (RD-25)", async () => {
		const bar = (await render({ current: "home" })).querySelector("#tabbar")
		expect([...(bar?.children ?? [])].map((child) => child.className)).toEqual(["tabbar"])
		expect(bar?.querySelector(".fab-menu, .fab, [popover]")).toBeNull()
	})

	test("holds no stray text beside the nav", async () => {
		const bar = (await render()).querySelector("#tabbar")
		const text = [...(bar?.childNodes ?? [])]
			.filter((node) => node.nodeType === 3)
			.map((node) => node.textContent?.trim())
			.filter(Boolean)
		expect(text).toEqual([])
	})
})
