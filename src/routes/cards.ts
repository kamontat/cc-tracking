import "@picocss/pico/css/pico.min.css";
import { bootstrap } from "#lib/ui/page.ts";

bootstrap(() => {
	const page = document.querySelector("#page");
	if (page) page.textContent = "Card registry ready.";
});
