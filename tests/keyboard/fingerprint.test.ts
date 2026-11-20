import { describe, expect, it } from "vitest";
import {
	createBurstTracker,
	type KeyRun,
} from "../../src/keyboard/burst-tracker";
import { buildFingerprint, percentile } from "../../src/keyboard/fingerprint";
import android from "./fixtures/android-ime-unidentified.json";
import windows from "./fixtures/windows-handheld-azerty.json";
import shiftHeld from "./fixtures/windows-handheld-shift-held.json";
import { keyAt, type ProducerReport, replayReport } from "./replay";

function runOf(report: ProducerReport): KeyRun {
	const tracker = createBurstTracker({ maxIntervalMs: 100, minLength: 5 });
	return replayReport(report)
		.map((key) => tracker.push(key))
		.filter((run) => run !== null)[0];
}

describe("percentile", () => {
	it("uses the nearest-rank method", () => {
		const values = [14, 15, 16, 16, 17, 17, 17, 17, 17, 32, 32, 33];
		expect(percentile(values, 50)).toBe(17);
		expect(percentile(values, 95)).toBe(33);
		expect(percentile(values, 100)).toBe(33);
	});

	it("does not depend on the input order", () => {
		expect(percentile([5, 1, 3], 50)).toBe(3);
	});

	it("returns 0 for an empty list", () => {
		expect(percentile([], 50)).toBe(0);
	});
});

describe("buildFingerprint", () => {
	it("profiles the Windows AZERTY handheld: CapsLock + Shift per digit + Enter", () => {
		expect(buildFingerprint(runOf(windows))).toEqual({
			keyStyle: "code_digit",
			shifted: "all",
			capslock: true,
			prefixModifier: true,
			terminator: "enter",
			length: 13,
			allDigits: true,
			keyMismatchCount: 0,
			gapP50Ms: 17,
			gapP95Ms: 33,
			gapMaxMs: 33,
			durationMs: 243,
		});
	});

	it("profiles the Android IME scan: unidentified keys, nothing readable", () => {
		expect(buildFingerprint(runOf(android))).toEqual({
			keyStyle: "key_unidentified",
			shifted: "none",
			capslock: false,
			prefixModifier: false,
			terminator: "enter",
			length: 12,
			allDigits: false,
			keyMismatchCount: 0,
			gapP50Ms: 15,
			gapP95Ms: 42,
			gapMaxMs: 42,
			durationMs: 197,
		});
	});

	it("profiles the very fast scanner that holds Shift", () => {
		expect(buildFingerprint(runOf(shiftHeld))).toMatchObject({
			keyStyle: "code_digit",
			shifted: "all",
			capslock: false,
			prefixModifier: true,
			terminator: "enter",
			length: 13,
			gapMaxMs: 10,
			durationMs: 57,
		});
	});

	it("flags digits whose key does not match their code (AZERTY scanner without Shift)", () => {
		const tracker = createBurstTracker({ maxIntervalMs: 100, minLength: 5 });
		const symbols = ["&", "é", '"', "'", "(", "-"];
		const run = [
			...symbols.map((key, i) => keyAt(i * 20, key, `Digit${i + 1}`)),
			keyAt(140, "Enter", "Enter"),
		]
			.map((input) => tracker.push(input))
			.filter((r) => r !== null)[0];

		const fingerprint = buildFingerprint(run);

		expect(fingerprint.keyMismatchCount).toBe(6);
		expect(fingerprint.shifted).toBe("none");
	});

	it("reports numpad and mixed key styles", () => {
		const tracker = createBurstTracker({ maxIntervalMs: 100, minLength: 5 });
		const numpad = [
			...Array.from({ length: 6 }, (_, i) =>
				keyAt(i * 20, String(i), `Numpad${i}`),
			),
			keyAt(140, "Enter", "Enter"),
		]
			.map((input) => tracker.push(input))
			.filter((r) => r !== null)[0];
		expect(buildFingerprint(numpad).keyStyle).toBe("code_numpad");

		const mixedTracker = createBurstTracker({
			maxIntervalMs: 100,
			minLength: 5,
		});
		const mixed = [
			keyAt(0, "A", "KeyA"),
			...Array.from({ length: 5 }, (_, i) => keyAt(20 + i * 20, String(i))),
			keyAt(140, "Enter", "Enter"),
		]
			.map((input) => mixedTracker.push(input))
			.filter((r) => r !== null)[0];
		expect(buildFingerprint(mixed).keyStyle).toBe("mixed");
		expect(buildFingerprint(mixed).allDigits).toBe(false);
	});

	it("reports shifted as some when only part of the digits carry Shift", () => {
		const tracker = createBurstTracker({ maxIntervalMs: 100, minLength: 5 });
		const run = [
			keyAt(0, "1", "Digit1", { shiftKey: true }),
			keyAt(20, "2", "Digit2"),
			keyAt(40, "3", "Digit3", { shiftKey: true }),
			keyAt(60, "4", "Digit4"),
			keyAt(80, "5", "Digit5"),
			keyAt(100, "Enter", "Enter"),
		]
			.map((input) => tracker.push(input))
			.filter((r) => r !== null)[0];

		expect(buildFingerprint(run).shifted).toBe("some");
	});
});
