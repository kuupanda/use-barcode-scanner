import { beforeEach, describe, expect, it } from "vitest";
import {
	createScanEngine,
	type ScanAttempt,
	type ScanEngine,
} from "../../src/keyboard/scan-engine";
import android from "./fixtures/android-ime-unidentified.json";
import windows from "./fixtures/windows-handheld-azerty.json";
import shiftHeld from "./fixtures/windows-handheld-shift-held.json";
import { createManualScheduler } from "./manual-scheduler";
import { keyAt, type ProducerReport, replayReport } from "./replay";

const CONFIG = { maxIntervalMs: 100, minLength: 5, idleFlushMs: 50 };

interface Harness {
	engine: ScanEngine;
	scans: string[];
	attempts: ScanAttempt[];
	scheduler: ReturnType<typeof createManualScheduler>;
	press(key: string, at: number, code?: string): { consumed: boolean };
	play(report: ProducerReport, startAt?: number): boolean[];
}

function setup(observeOnly = false): Harness {
	const scheduler = createManualScheduler();
	const scans: string[] = [];
	const attempts: ScanAttempt[] = [];
	const engine = createScanEngine(CONFIG, {
		onScan: (code) => scans.push(code),
		onAttempt: (attempt) => attempts.push(attempt),
		observeOnly,
		schedule: scheduler.schedule,
		cancel: scheduler.cancel,
	});
	return {
		engine,
		scans,
		attempts,
		scheduler,
		press(key, at, code) {
			scheduler.advanceTo(at);
			return engine.handleKey(keyAt(at, key, code));
		},
		play(report, startAt = 1_000) {
			return replayReport(report, startAt).map((input) => {
				scheduler.advanceTo(input.timestamp);
				return engine.handleKey(input).consumed;
			});
		},
	};
}

function typeDigits(h: Harness, digits: string, startAt = 1_000): number {
	let at = startAt;
	for (const digit of digits) {
		h.press(digit, at);
		at += 20;
	}
	return at;
}

describe("createScanEngine", () => {
	let h: Harness;
	beforeEach(() => {
		h = setup();
	});

	describe("delivery", () => {
		it("delivers a digit burst closed by Enter, and consumes that Enter", () => {
			const at = typeDigits(h, "3760123456784");
			const { consumed } = h.press("Enter", at, "Enter");

			expect(h.scans).toEqual(["3760123456784"]);
			expect(consumed).toBe(true);
			expect(h.attempts).toHaveLength(1);
			expect(h.attempts[0]).toMatchObject({
				delivered: true,
				code: "3760123456784",
				trigger: "enter",
			});
			expect(h.attempts[0].run.terminator).toBe("enter");
		});

		it("delivers by idle flush when no Enter arrives, and reports it once", () => {
			const end = typeDigits(h, "3760123456784");
			h.scheduler.advanceTo(end - 20 + 101);

			expect(h.scans).toEqual(["3760123456784"]);
			expect(h.attempts).toHaveLength(1);
			expect(h.attempts[0]).toMatchObject({ delivered: true, trigger: "idle" });
			expect(h.attempts[0].run.terminator).toBe("idle");

			h.scheduler.advanceBy(1_000);
			expect(h.attempts).toHaveLength(1);
		});

		it("does not split a slow scanner whose gaps exceed the idle flush time", () => {
			let at = 1_000;
			for (const digit of "3760123456784") {
				h.press(digit, at);
				at += 70;
			}
			h.press("Enter", at, "Enter");
			h.scheduler.advanceBy(1_000);

			expect(h.scans).toEqual(["3760123456784"]);
		});

		it("never flushes idle sooner than the gap that separates two bursts", () => {
			const end = typeDigits(h, "3760123456784");
			h.scheduler.advanceTo(end - 20 + 100);
			expect(h.scans).toEqual([]);

			h.scheduler.advanceTo(end - 20 + 101);
			expect(h.scans).toEqual(["3760123456784"]);
		});

		it("never delivers fewer digits than the minimum", () => {
			const at = typeDigits(h, "1234");
			h.press("Enter", at, "Enter");
			h.scheduler.advanceBy(1_000);

			expect(h.scans).toEqual([]);
			expect(h.attempts).toEqual([]);
		});

		it("does not consume an Enter that delivered nothing", () => {
			expect(h.press("Enter", 1_000, "Enter").consumed).toBe(false);
		});

		it("starts a new burst when the gap between keys is too long", () => {
			typeDigits(h, "11111", 1_000);
			h.scheduler.advanceBy(0);
			const at = typeDigits(h, "22222", 1_500);
			h.press("Enter", at, "Enter");

			expect(h.scans).toEqual(["11111", "22222"]);
		});

		it("ignores modifier keys interleaved between digits", () => {
			const shifted = h.play(shiftHeld);

			expect(h.scans).toEqual([shiftHeld.content]);
			expect(shifted.at(-1)).toBe(true);
		});

		it("delivers the real Windows handheld capture, trailing CapsLock included", () => {
			h.play(windows);
			h.scheduler.advanceBy(1_000);

			expect(h.scans).toEqual([windows.content]);
			expect(h.attempts).toHaveLength(1);
		});

		it("accepts digits typed on the numpad", () => {
			let at = 1_000;
			for (const digit of "12345") {
				h.press(digit, at, `Numpad${digit}`);
				at += 20;
			}
			h.press("Enter", at, "Enter");

			expect(h.scans).toEqual(["12345"]);
		});

		it("delivers the digits that trail a letter", () => {
			h.press("A", 1_000, "KeyA");
			const at = typeDigits(h, "123456", 1_020);
			h.press("Enter", at, "Enter");

			expect(h.scans).toEqual(["123456"]);
		});
	});

	describe("rejections the hook cannot deliver", () => {
		it("explains an Android IME burst of Unidentified keys", () => {
			h.play(android);
			h.scheduler.advanceBy(1_000);

			expect(h.scans).toEqual([]);
			expect(h.attempts).toHaveLength(1);
			expect(h.attempts[0]).toMatchObject({
				delivered: false,
				reason: "unreadable_keys",
			});
		});

		it("explains a burst closed by Tab", () => {
			const at = typeDigits(h, "3760123456784");
			h.press("Tab", at - 20 + 10, "Tab");
			h.scheduler.advanceBy(1_000);

			expect(h.scans).toEqual([]);
			expect(h.attempts[0]).toMatchObject({
				delivered: false,
				reason: "tab_terminator",
			});
		});

		it("explains a burst with letters that leave too few trailing digits", () => {
			h.press("A", 1_000, "KeyA");
			const at = typeDigits(h, "1234", 1_020);
			h.press("Enter", at, "Enter");

			expect(h.scans).toEqual([]);
			expect(h.attempts[0]).toMatchObject({
				delivered: false,
				reason: "non_digit_chars",
			});
		});

		it("reports a burst that just stops, with fewer digits than needed, once the keys go quiet", () => {
			let at = 1_000;
			h.press("Q", at, "KeyQ");
			for (const digit of "1234") {
				at += 20;
				h.press(digit, at);
			}
			h.scheduler.advanceBy(1_000);

			expect(h.attempts).toHaveLength(1);
			expect(h.attempts[0]).toMatchObject({
				delivered: false,
				reason: "non_digit_chars",
			});
		});

		it("never reports typing slower than a scanner as an attempt", () => {
			h.press("1", 1_000);
			h.press("2", 1_400);
			h.press("3", 1_800);
			h.press("Enter", 2_200, "Enter");
			h.scheduler.advanceBy(1_000);

			expect(h.attempts).toEqual([]);
		});
	});

	describe("observe only", () => {
		beforeEach(() => {
			h = setup(true);
		});

		it("never delivers, and says the scanner was off", () => {
			const at = typeDigits(h, "3760123456784");
			const { consumed } = h.press("Enter", at, "Enter");

			expect(h.scans).toEqual([]);
			expect(consumed).toBe(false);
			expect(h.attempts).toHaveLength(1);
			expect(h.attempts[0]).toMatchObject({
				delivered: false,
				reason: "disabled",
			});
		});

		it("says the scanner was off for a burst without Enter too", () => {
			typeDigits(h, "3760123456784");
			h.scheduler.advanceBy(1_000);

			expect(h.attempts).toHaveLength(1);
			expect(h.attempts[0]).toMatchObject({
				delivered: false,
				reason: "disabled",
			});
		});
	});

	describe("attempt data", () => {
		it("carries the burst shape without the digits of unrelated keys", () => {
			const at = typeDigits(h, "3760123456784");
			h.press("Enter", at, "Enter");

			const { run } = h.attempts[0];
			expect(run.keys).toHaveLength(13);
			expect(run.digits).toBe("3760123456784");
			expect(run.durationMs).toBe(12 * 20);
		});
	});

	describe("dispose", () => {
		it("cancels pending timers and reports nothing afterwards", () => {
			typeDigits(h, "3760123456784");
			h.engine.dispose();
			h.scheduler.advanceBy(1_000);

			expect(h.scans).toEqual([]);
			expect(h.attempts).toEqual([]);
			expect(h.scheduler.pendingCount()).toBe(0);
		});
	});
});
