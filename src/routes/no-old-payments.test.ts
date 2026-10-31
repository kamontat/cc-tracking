import { expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * Payments are card payments now. The per-statement records are read only (to convert them),
 * so no page or component may write one back through the repository. (The `savePayment` helper in
 * `record-payment.ts` writes card payments and is a plain function, not a repository method.)
 */
test("no route or component writes an old statement payment", async () => {
	const offenders: string[] = [];
	for (const pattern of ["routes/**/*.ts", "components/**/*.ts"]) {
		for await (const path of new Glob(pattern).scan({
			cwd: import.meta.dir + "/..",
		})) {
			if (path.endsWith(".test.ts")) continue;
			const text = await Bun.file(`${import.meta.dir}/../${path}`).text();
			if (/\.(savePayment|deletePayment)\(/.test(text)) offenders.push(path);
		}
	}
	expect(offenders).toEqual([]);
});
