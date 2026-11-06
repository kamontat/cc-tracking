import { loadRenderers } from "astro:container"
import { getContainerRenderer as svelteRenderer } from "@astrojs/svelte"
import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { Window } from "happy-dom"

/**
 * Parses rendered HTML into a document to query. Container tests run under the node
 * environment, which has no DOM of its own, so this borrows happy-dom's.
 */
export const parseHtml = (html: string) => {
	const { document } = new Window()
	document.write(html)
	return document
}

/**
 * An Astro container that can also render Svelte islands (PRD DD-172). Use it, under
 * `// @vitest-environment node`, for anything that renders a component, layout or page with an
 * island inside; a container without the Svelte renderer fails with NoMatchingRenderer.
 */
export const createContainer = async () => AstroContainer.create({ renderers: await loadRenderers([svelteRenderer()]) })
