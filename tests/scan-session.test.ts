import { describe, expect, it } from "vitest";
import {
	createScanSession,
	registerDetection,
	registerMiss,
} from "../src/scan-session";

describe("scan session", () => {
	it("should accept the first code seen", () => {
		const session = createScanSession();
		const result = registerDetection(session, "12345", 0);
		expect(result.accept).toBe(true);
	});

	it("should reject the same code seen again right away", () => {
		const first = registerDetection(createScanSession(), "12345", 0);
		const second = registerDetection(first.session, "12345", 50);
		expect(second.accept).toBe(false);
	});

	it("should reject the same code repeatedly within the dedupe window", () => {
		let session = createScanSession();
		for (const t of [0, 200, 400, 1000, 1999, 4000, 7999]) {
			const result = registerDetection(session, "12345", t);
			session = result.session;
			if (t > 0) {
				expect(result.accept).toBe(false);
			}
		}
	});

	it("should keep rejecting a code held motionless in frame well past the old 2s window", () => {
		// The reported bug this guards against: a barcode propped up and
		// never removed from view kept adding a new line every couple of
		// seconds. The dedupe window is a safety-net ceiling, not a routine
		// re-accept path — only a sustained absence (registerMiss) should let
		// the same code count again.
		let session = registerDetection(createScanSession(), "12345", 0).session;
		for (const t of [2000, 3000, 5000, 7999]) {
			const result = registerDetection(session, "12345", t);
			session = result.session;
			expect(result.accept).toBe(false);
		}
	});

	it("should accept the same code again once the dedupe window has elapsed", () => {
		const first = registerDetection(createScanSession(), "12345", 0);
		const second = registerDetection(first.session, "12345", 8000);
		expect(second.accept).toBe(true);
	});

	it("should not accept a different code from a single sighting — could be a misread blip", () => {
		const first = registerDetection(createScanSession(), "12345", 0);
		const second = registerDetection(first.session, "67890", 50);
		expect(second.accept).toBe(false);
	});

	it("should accept a different code once it has persisted past the confirmation window (a genuine swap, not a misread blip)", () => {
		const first = registerDetection(createScanSession(), "12345", 0);
		const pending = registerDetection(first.session, "67890", 50);
		const result = registerDetection(pending.session, "67890", 250);
		expect(result.accept).toBe(true);
	});

	it("should not let a single misread of a different code interrupt dedupe of the code actually being held", () => {
		// A decoder occasionally misreads a wrong/nonexistent code for a
		// single frame while pointed at one motionless barcode, then reads
		// the real code correctly again a few ms later — which must not look
		// like a brand-new scan of the real code.
		const first = registerDetection(createScanSession(), "12345", 0);
		const misread = registerDetection(first.session, "99999", 40);
		expect(misread.accept).toBe(false);

		const reread = registerDetection(misread.session, "12345", 80);
		expect(reread.accept).toBe(false);
	});

	it("should restart the confirmation streak if a second, different misread interrupts the first candidate", () => {
		const first = registerDetection(createScanSession(), "12345", 0);
		const misreadA = registerDetection(first.session, "11111", 40);
		const misreadB = registerDetection(misreadA.session, "22222", 80);
		expect(misreadB.accept).toBe(false);

		const reread = registerDetection(misreadB.session, "12345", 120);
		expect(reread.accept).toBe(false);
	});

	it("should still reject a repeated code if it was never missing and the window hasn't passed", () => {
		const first = registerDetection(createScanSession(), "12345", 0);
		const second = registerDetection(first.session, "12345", 1500);
		expect(second.accept).toBe(false);
	});

	it("should tolerate a single brief miss (autofocus blip) without treating the item as gone", () => {
		// A decoder's read is noisy even while a barcode is held perfectly
		// still, so a strict single-frame rule causes burst duplicate scans
		// in real usage. A brief miss must not reset the session.
		const first = registerDetection(createScanSession(), "12345", 0);
		const afterBriefMiss = registerMiss(first.session, 50);
		const second = registerDetection(afterBriefMiss, "12345", 100);
		expect(second.accept).toBe(false);
	});

	it("should accept the same code again once it has been missing continuously past the grace period", () => {
		// Mirrors three identical jars scanned in a row: the code is truly
		// absent from the frame for a sustained stretch while the cashier
		// swaps items, not just for one noisy frame.
		let session = registerDetection(createScanSession(), "12345", 0).session;
		session = registerMiss(session, 100);
		session = registerMiss(session, 400);
		session = registerMiss(session, 850); // 750ms since the miss streak began at 100
		const result = registerDetection(session, "12345", 900);
		expect(result.accept).toBe(true);
	});

	it("should reset the missing streak if the code is seen again before the grace period elapses", () => {
		let session = registerDetection(createScanSession(), "12345", 0).session;
		session = registerMiss(session, 100);
		session = registerDetection(session, "12345", 150).session;
		session = registerMiss(session, 200);
		const result = registerDetection(session, "12345", 300);
		expect(result.accept).toBe(false);
	});

	describe("configurable tuning", () => {
		it("should use a custom dedupeWindowMs instead of the 8s default", () => {
			const first = registerDetection(
				createScanSession({ dedupeWindowMs: 500 }),
				"12345",
				0,
			);
			const stillWithinCustomWindow = registerDetection(
				first.session,
				"12345",
				400,
			);
			expect(stillWithinCustomWindow.accept).toBe(false);

			const pastCustomWindow = registerDetection(
				stillWithinCustomWindow.session,
				"12345",
				500,
			);
			expect(pastCustomWindow.accept).toBe(true);
		});

		it("should use a custom missingGraceMs instead of the 700ms default", () => {
			let session = registerDetection(
				createScanSession({ missingGraceMs: 200 }),
				"12345",
				0,
			).session;
			session = registerMiss(session, 10); // starts the miss streak
			session = registerMiss(session, 220); // 210ms since the streak began, past the custom 200ms grace
			const result = registerDetection(session, "12345", 230);
			expect(result.accept).toBe(true);
		});

		it("should use a custom codeChangeConfirmMs instead of the 150ms default", () => {
			const first = registerDetection(
				createScanSession({ codeChangeConfirmMs: 30 }),
				"12345",
				0,
			);
			const pending = registerDetection(first.session, "67890", 10);
			const result = registerDetection(pending.session, "67890", 40);
			expect(result.accept).toBe(true);
		});

		it("should ignore an explicit undefined override and keep the default for that field", () => {
			// A consumer that forwards optional props straight through (e.g.
			// `createScanSession({ dedupeWindowMs, missingGraceMs })` where
			// only one was actually passed by its own caller) must not have
			// the untouched fields blown away by an explicit `undefined`.
			const first = registerDetection(
				createScanSession({ dedupeWindowMs: undefined, missingGraceMs: 200 }),
				"12345",
				0,
			);
			const stillWithinDefaultWindow = registerDetection(
				first.session,
				"12345",
				1500,
			);
			expect(stillWithinDefaultWindow.accept).toBe(false);
		});

		it("should keep using the config a session was created with across every call", () => {
			let session = createScanSession({ dedupeWindowMs: 100 });
			session = registerDetection(session, "12345", 0).session;
			session = registerMiss(session, 50);
			const result = registerDetection(session, "12345", 100);
			expect(result.accept).toBe(true);
		});
	});
});
