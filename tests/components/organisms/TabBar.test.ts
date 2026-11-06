// @vitest-environment node
import { describe, expect, test } from "vitest"

import TabBar from "#components/organisms/TabBar.astro"
import { createContainer, parseHtml } from "../../container"

const render = async (props: { current?: string; fab?: boolean } = {}) =>
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

	test("one floating + New menu, outside the nav", async () => {
		const doc = await render({ current: "home" })
		const menus = doc.querySelectorAll(".fab-menu")
		expect(menus).toHaveLength(1)
		expect(menus[0]?.closest("nav")).toBeNull()
	})

	test("a page mid-task leaves + New out", async () => {
		const doc = await render({ current: "home", fab: false })
		expect(doc.querySelector(".fab-menu")).toBeNull()
		expect(doc.querySelector(".tabbar")).not.toBeNull()
	})

	test("holds no stray text beside the nav and the menu", async () => {
		const bar = (await render()).querySelector("#tabbar")
		const text = [...(bar?.childNodes ?? [])]
			.filter((node) => node.nodeType === 3)
			.map((node) => node.textContent?.trim())
			.filter(Boolean)
		expect(text).toEqual([])
	})
})
