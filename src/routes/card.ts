import "@picocss/pico/css/pico.min.css";
import { bootstrap } from "#lib/ui/page.ts";

bootstrap(() => {
	const page = document.querySelector("#page");
	const cardId = new URLSearchParams(location.search).get("id");
	if (page) page.textContent = cardId ? `Card ${cardId} ready.` : "No card selected.";
});
