// @vitest-environment node
import { expect, test } from "vitest"

import AppLayout from "#layouts/AppLayout.astro"
import { createContainer, parseHtml } from "../container"

const render = async (props: Record<string, unknown>, slot = "") =>
	parseHtml(
		await (await createContainer()).renderToString(AppLayout, {
			props: { title: "Cards", ...props },
			slots: { default: slot },
		}),
	)

test("puts the header, the page's main and the tab bar inside the document BaseLayout writes", async () => {
	const doc = await render({ tab: "cards", mainClass: "page--narrow" })
	expect(doc.querySelector("title")?.textContent).toBe("Cards — cc-tracking")
	const body = [...doc.body.children].map((child) => child.id || child.tagName.toLowerCase())
	expect(body.slice(0, 3)).toEqual(["site-header", "page", "tabbar"])
	expect(doc.querySelector("main#page")?.className).toBe("page page--narrow")
})

test("marks the page's tab in both navs", async () => {
	const doc = await render({ tab: "settings" })
	for (const nav of [".site-header__tabs", ".tabbar"]) {
		expect(doc.querySelector(`${nav} [aria-current="page"]`)?.getAttribute("data-tab")).toBe("settings")
	}
})

test("shows + New unless the page says it is mid-task", async () => {
	expect((await render({ tab: "home" })).querySelector(".fab-menu")).not.toBeNull()
	expect((await render({ tab: "home", fab: false })).querySelector(".fab-menu")).toBeNull()
})

test("passes the page's own content through after the shell", async () => {
	const doc = await render({ tab: "home" }, `<p id="own">mine</p>`)
	expect(doc.querySelector("#own")?.textContent).toBe("mine")
})
