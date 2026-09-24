import type { Catalog } from "#lib/i18n/catalog";

/**
 * Pending owner review (Task 8 Step 3 of
 * docs/superpowers/plans/2026-09-21-english-thai.md, not yet done as of this comment):
 * a handful of terms were machine-translated without a native speaker's eye and are flagged
 * below, at their first appearance, for the repository owner to confirm or correct. Nothing
 * else in this file has been reviewed either, but these specifically depend on getting a
 * domain term or a sentence's word order right, not just a dictionary word.
 */
export const th: Catalog = {
	"nav.brand": "cc-tracking",
	"nav.dashboard": "หน้ารวม",
	"nav.cards": "บัตร",
	"nav.settings": "ตั้งค่า",
	"nav.backup": "สำรองข้อมูล",
	"title.dashboard": "หน้ารวม — cc-tracking",
	"title.cards": "ทะเบียนบัตร — cc-tracking",
	"title.card": "บัตร — cc-tracking",
	"title.settings": "ตั้งค่า — cc-tracking",
	"title.backup": "สำรองข้อมูล — cc-tracking",
	"lang.label": "ภาษา",
	"lang.en": "English",
	"lang.th": "ไทย",

	"common.reload": "โหลดใหม่",
	"common.retry": "ลองอีกครั้ง",
	"common.cancel": "ยกเลิก",
	"common.edit": "แก้ไข",
	"common.delete": "ลบ",
	"common.dismiss": "ปิด",
	"common.none": "—",

	"relative.today": "วันนี้",
	"relative.inDays": "อีก {days} วัน",
	"relative.agoDays": "{days} วันก่อน",

	"location.bangkok": "กรุงเทพฯ",
	"location.phichit": "พิจิตร",
	"location.krabi": "กระบี่",

	"dashboard.title": "หน้ารวม",
	// FLAG FOR OWNER REVIEW: "due date" -- ครบกำหนด, used throughout this catalog.
	"dashboard.dueNext": "ครบกำหนดถัดไป",
	"dashboard.addPurchase": "เพิ่มรายการใช้จ่าย",
	// FLAG FOR OWNER REVIEW: "statement" -- ใบแจ้งยอด (also card.showOlder, statements.empty)
	// and "close date" -- ปิดยอด (also due.column.closes, form.closeDay, statements.header,
	// cycle.offset/fixed). This sentence also depends on Thai word order matching English.
	"dashboard.answer": "อยู่ในใบแจ้งยอดที่ปิดยอดวันที่ {close} — ชำระภายใน {due}",
	"dashboard.answerOver": "ยอดนี้เกินวงเงิน {name} อยู่ {over}",
	"dashboard.error.read": "อ่านข้อมูลบัตรไม่สำเร็จ",
	"dashboard.error.markPaid": "บันทึกการชำระเงินไม่สำเร็จ",
	"dashboard.error.addPurchase": "บันทึกรายการใช้จ่ายไม่สำเร็จ",

	"due.empty": "ยังไม่มีบัตร",
	"due.emptyAction": "เพิ่มบัตรได้ที่หน้าบัตร",
	"due.column.card": "บัตร",
	"due.column.where": "ที่อยู่",
	"due.column.closes": "ปิดยอด",
	"due.column.due": "ครบกำหนด",
	"due.column.total": "รวม",
	"due.overdue": "เกินกำหนด {days} วัน",
	"due.today": "ครบกำหนดวันนี้",
	"due.inDays": "อีก {days} วัน",
	"due.stillOpen": "ยังไม่ปิดยอด",
	"due.markPaid": "บันทึกว่าชำระแล้ว",

	"groups.title": "บัตรแยกตามที่อยู่",
	"groups.nextDue": "ครบกำหนดถัดไป {date}",

	"quickAdd.card": "บัตร",
	"quickAdd.date": "วันที่",
	"quickAdd.amount": "จำนวนเงิน (บาท)",
	"quickAdd.amountPlaceholder": "1234.56",
	"quickAdd.note": "หมายเหตุ",
	"quickAdd.notePlaceholder": "เครื่องเขียนสำนักงาน",
	"quickAdd.submit": "เพิ่มรายการ",
	"quickAdd.noEligible":
		"ไม่มีบัตรใบใดบันทึกรายการใหม่ได้ ไปที่หน้าตั้งค่าแล้วติ๊กที่ที่ใช้จ่ายใต้หัวข้อการใช้จ่าย",
	"quickAdd.error.noCard": "เลือกบัตรก่อน",
	"quickAdd.error.badDate": "ไม่มีวันที่นี้ ใช้รูปแบบ YYYY-MM-DD",
	"quickAdd.error.futureDate": "วันที่อยู่ในอนาคต รายการบัตรเครดิตลงวันที่ล่วงหน้าไม่ได้",
	"quickAdd.error.badAmount": "กรอกจำนวนเงินเป็นบาท เช่น 1234.56",
	"quickAdd.available": "คงเหลือ {available} จาก {limit}",

	"cards.title": "บัตร",
	"cards.add": "เพิ่มบัตร",
	"cards.edit": "แก้ไข {name}",
	"cards.empty": "ยังไม่มีบัตร เพิ่มใบแรกด้วยแบบฟอร์มด้านบน",
	"cards.column.id": "รหัส",
	"cards.column.name": "ชื่อ",
	"cards.column.last4": "เลข 4 ตัวท้าย",
	"cards.column.location": "ที่อยู่",
	"cards.column.owner": "เจ้าของ",
	// FLAG FOR OWNER REVIEW: "billing cycle" -- รอบบิล (also form.cycle and the
	// backup.problem.*Cycle fragments below).
	"cards.column.cycle": "รอบบิล",
	"cards.column.comment": "หมายเหตุ",
	"cards.column.limitGroup": "กลุ่มวงเงิน",
	"cards.unassigned": "ยังไม่ผูกกลุ่ม",
	"cards.archived": "(เก็บเข้าคลัง)",
	"cards.archive": "เก็บเข้าคลัง",
	"cards.unarchive": "นำออกจากคลัง",
	"cards.purchaseCount": "{count} รายการ",
	"cards.locationReset":
		"บัตรเหล่านี้เคยเก็บไว้ในที่ที่แอปไม่รู้จักแล้ว จึงตั้งที่เก็บเป็นกรุงเทพฯ: {names} แก้ไขแต่ละใบเพื่อเลือกที่เก็บที่ถูกต้อง",
	"cards.error.read": "อ่านรายการบัตรไม่สำเร็จ",
	"cards.error.save": "บันทึกบัตรไม่สำเร็จ",
	"cards.error.delete": "ลบบัตรไม่สำเร็จ",
	"cards.error.archive": "เก็บบัตรเข้าคลังไม่สำเร็จ",
	"cards.error.saveGroup": "บันทึกกลุ่มวงเงินไม่สำเร็จ",
	"cards.error.deleteGroup": "ลบกลุ่มวงเงินไม่สำเร็จ",
	"cards.error.duplicateId": 'มีบัตรรหัส "{id}" อยู่แล้ว รหัสบัตรต้องไม่ซ้ำกัน',

	"form.id": "รหัส",
	"form.idImmutable": "(เปลี่ยนไม่ได้)",
	"form.idPlaceholder": "0001",
	"form.name": "ชื่อ",
	"form.last4": "เลข 4 ตัวท้าย",
	"form.location": "ที่อยู่",
	"form.supplementary": "บัตรเสริม",
	"form.limitGroup": "กลุ่มวงเงิน",
	"form.limitGroupNone": "เลือกกลุ่มวงเงิน",
	"form.limitGroupEmpty": "สร้างกลุ่มวงเงินในส่วนด้านล่างก่อน",
	"form.cycle": "รอบบิล",
	"form.cycleOffset": "ครบกำหนดหลังปิดยอดกี่วัน",
	"form.cycleFixed": "ครบกำหนดวันที่แน่นอนของเดือน",
	"form.closeDay": "วันปิดยอด",
	"form.dueOffsetDays": "จำนวนวันจนครบกำหนด",
	"form.dueDay": "วันครบกำหนด",
	"form.comment": "หมายเหตุ",
	"form.save": "บันทึกการแก้ไข",
	"form.add": "เพิ่มบัตร",
	"form.error.id": "ตั้งรหัสบัตรที่จำได้",
	"form.error.name": "ตั้งชื่อบัตร",
	"form.error.last4": "เลข 4 ตัวท้ายต้องเป็นตัวเลขสี่หลัก",
	"form.error.location": "เลือกที่อยู่บัตร",
	"form.error.limitGroup": "เลือกกลุ่มวงเงินที่บัตรใบนี้ใช้",
	"form.error.closeDay": "วันปิดยอดต้องอยู่ระหว่าง 1 ถึง 31",
	"form.error.dueOffsetDays": "จำนวนวันจนครบกำหนดต้องอยู่ระหว่าง 1 ถึง 60",
	"form.error.dueDay": "วันครบกำหนดต้องอยู่ระหว่าง 1 ถึง 31",

	"card.showOlder": "ดูใบแจ้งยอดเก่ากว่านี้",
	"card.back": "กลับไปหน้าบัตร",
	"card.error.noSelection": "ยังไม่ได้เลือกบัตร",
	"card.error.notFound": "ไม่พบบัตรรหัส {id}",
	"card.error.read": "อ่านข้อมูลบัตรนี้ไม่สำเร็จ",
	"card.error.markPaid": "บันทึกการชำระเงินไม่สำเร็จ",
	"card.error.unmarkPaid": "ยกเลิกการชำระเงินไม่สำเร็จ",
	"card.error.deletePurchase": "ลบรายการใช้จ่ายไม่สำเร็จ",

	"statements.empty": "ยังไม่มีใบแจ้งยอด เพิ่มรายการใช้จ่ายจากหน้ารวม",
	"statements.header": "ปิดยอด {close} ครบกำหนด {due}",
	"statements.paid": "ชำระแล้ว {date}",
	"statements.unmark": "ยกเลิกเครื่องหมาย",
	"statements.markPaid": "บันทึกว่าชำระแล้ว",
	"statements.noPurchases": "ไม่มีรายการใช้จ่ายในรอบนี้",
	"statements.total": "รวม {amount}",

	"cycle.offset": "ปิดยอดวันที่ {closeDay} ครบกำหนดอีก {days} วัน",
	"cycle.fixed": "ปิดยอดวันที่ {closeDay} ครบกำหนดวันที่ {dueDay}",

	"storage.unavailable":
		"เบราว์เซอร์นี้ไม่อนุญาตให้หน้าเว็บเก็บข้อมูล หน้าต่างส่วนตัวและการบล็อกข้อมูลเว็บไซต์ทำให้เกิดปัญหานี้",
	"startup.failed": "เริ่มหน้าเว็บไม่สำเร็จ",

	"backup.title": "สำรองข้อมูล",
	"backup.warning":
		"ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น ส่งออกเป็นประจำ การล้างข้อมูลเว็บไซต์จะลบทั้งหมด",
	"backup.export": "ส่งออก JSON",
	"backup.import": "นำเข้า JSON",
	"backup.error.read": "อ่านข้อมูลไม่สำเร็จ",
	"backup.error.export": "ส่งออกข้อมูลสำรองไม่สำเร็จ",
	"backup.error.import": "นำเข้าข้อมูลสำรองไม่สำเร็จ",

	"backup.unreadable": "ไฟล์นี้ไม่ใช่ข้อมูลสำรองที่อ่านได้",
	"backup.version": "ข้อมูลสำรองนี้เป็นเวอร์ชัน {found} แต่แอปอ่านเวอร์ชัน {expected}",
	// FLAG FOR OWNER REVIEW: backup.card / backup.purchase / backup.payment are each
	// assembled with one of the backup.problem.* fragments below (backup.card + " " +
	// backup.problem.missingId, say) to form one sentence, so Thai word order has to match
	// what the English assembly produces, not just translate each fragment in isolation.
	"backup.card": "บัตรลำดับที่ {index} ในข้อมูลสำรอง {problem}",
	"backup.purchase": "รายการใช้จ่ายลำดับที่ {index} ในข้อมูลสำรอง {problem}",
	"backup.payment": "การชำระเงินลำดับที่ {index} ในข้อมูลสำรอง {problem}",
	"backup.limitGroup": "กลุ่มวงเงินที่ {index} ในข้อมูลสำรอง {problem}",
	"backup.problem.notObject": "ไม่ใช่ออบเจ็กต์",
	"backup.problem.missingId": "ไม่มีรหัส",
	"backup.problem.missingName": "ไม่มีชื่อ",
	"backup.problem.missingLast4": "ไม่มีเลข 4 ตัวท้าย",
	"backup.problem.badLocation": "มีที่เก็บที่ไม่ใช่ bangkok, phichit หรือ krabi",
	"backup.problem.badOwner": "มีเจ้าของที่ไม่ใช่ KC, NT หรือ RI",
	// FLAG FOR OWNER REVIEW: noCycle and missingPeriod below both render as "ไม่มีรอบบิล"
	// ("has no cycle" vs. "is missing a period" in English -- two different problems).
	// Benign today: backup.card and backup.payment name which one broke ("card #N ..." vs.
	// "payment #N ..."), so the sentence still disambiguates. But it is the exact class of
	// bug this review exists to catch, so it is flagged rather than silently left.
	"backup.problem.noCycle": "ไม่มีรอบบิล",
	"backup.problem.badOffsetCycle": "มีรอบบิลแบบ offset ที่ค่าวันไม่ใช่จำนวนเต็ม",
	"backup.problem.badFixedCycle": "มีรอบบิลแบบ fixed ที่ค่าวันไม่ใช่จำนวนเต็ม",
	"backup.problem.badCycleKind": 'มีรอบบิลที่ kind ไม่ใช่ "offset" หรือ "fixed"',
	"backup.problem.missingCardId": "ไม่มี cardId",
	"backup.problem.badDate": "วันที่ไม่ถูกต้อง",
	"backup.problem.badAmount": "จำนวนเงินไม่ใช่จำนวนเต็ม",
	// See the noCycle comment above -- same collision, same "ไม่มีรอบบิล" text.
	"backup.problem.missingPeriod": "ไม่มีรอบบิล",
	"backup.problem.badPaidAt": "วันที่ paidAt ไม่ถูกต้อง",
	"backup.problem.badCloseDate": "วันที่ closeDate ไม่ถูกต้อง",
	"backup.problem.badDueDate": "วันที่ dueDate ไม่ถูกต้อง",
	"backup.problem.badLimit": "มีวงเงินที่ไม่ใช่จำนวนเต็มสตางค์",

	"limits.title": "กลุ่มวงเงิน",
	"limits.explain": "กลุ่มคือวงเงินหนึ่งก้อน บัตรที่ใช้วงเงินร่วมกันอยู่กลุ่มเดียวกัน",
	"limits.empty": "ยังไม่มีกลุ่มวงเงิน สร้างก่อนเพิ่มบัตร",
	"limits.column.name": "ชื่อ",
	"limits.column.owner": "เจ้าของ",
	"limits.column.limit": "วงเงิน",
	"limits.column.cards": "บัตร",
	"limits.column.used": "ใช้ไป",
	"limits.column.available": "คงเหลือ",
	"limits.add": "เพิ่มกลุ่มวงเงิน",
	"limits.edit": "แก้ไข {name}",
	"limits.save": "บันทึกการแก้ไข",
	"limits.owner": "เจ้าของ",
	"limits.name": "ชื่อ",
	"limits.namePlaceholder": "บัญชี KBank",
	"limits.limit": "วงเงิน (บาท)",
	"limits.limitPlaceholder": "300000",
	"limits.inUse": "มีบัตรใช้กลุ่มนี้ {count} ใบ",
	"limits.error.name": "ตั้งชื่อกลุ่มวงเงิน",
	"limits.error.limit": "กรอกวงเงินเป็นบาท เช่น 300000",
	"limits.error.owner": "เลือกเจ้าของกลุ่มวงเงิน",

	"settings.title": "ตั้งค่า",
	"settings.purchases.title": "การใช้จ่าย",
	"settings.purchases.explain": "บันทึกรายการใหม่ได้กับบัตรทุกใบที่เก็บไว้ในที่ที่ติ๊กไว้ตรงนี้",
	"settings.purchases.legend": "ที่ที่บันทึกรายการใหม่ได้",
	"settings.purchases.none":
		"ยังไม่มีที่ใดบันทึกรายการใหม่ได้ จึงรูดบัตรไม่ได้เลย ติ๊กอย่างน้อยหนึ่งที่",
	"settings.error.read": "อ่านการตั้งค่าไม่สำเร็จ",
	"settings.error.save": "บันทึกการตั้งค่าไม่สำเร็จ",

	"spendable.title": "รูดได้ตอนนี้",
	"spendable.column.card": "บัตร",
	"spendable.column.available": "คงเหลือ",
	"spendable.column.closes": "ปิดยอด",
	"spendable.column.due": "ครบกำหนด",
	"spendable.of": "จาก {limit}",
	"spendable.shared": "{name} ใช้ร่วมกับอีก {count} ใบ",
	"spendable.empty": "ไม่มีบัตรที่รูดได้",
	"spendable.unassigned": "มีบัตร {count} ใบยังไม่ผูกกลุ่มวงเงิน",
	"spendable.unassignedAction": "ไปผูกกลุ่ม",
};
