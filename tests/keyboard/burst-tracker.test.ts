import { beforeEach, describe, expect, it } from "vitest";
import {
	type BurstTracker,
	createBurstTracker,
} from "../../src/keyboard/burst-tracker";
import type { KeyInput } from "../../src/keyboard/key-input";
import android from "./fixtures/android-ime-unidentified.json";
import windows from "./fixtures/windows-handheld-azerty.json";
import { keyAt, replayReport } from "./replay";

const CONFIG = { maxIntervalMs: 100, minLength: 5 };

function pushAll(tracker: BurstTracker, keys: KeyInput[]) {
	return keys.map((key) => tracker.push(key)).filter((run) => run !== null);
}

function digitRun(startAt: number, gapMs: number, count: number): KeyInput[] {
	return Array.from({ length: count }, (_, i) =>
		keyAt(startAt + i * gapMs, String((i + 1) % 10)),
	);
}

describe("createBurstTracker", () => {
	let tracker: BurstTracker;

	beforeEach(() => {
		tracker = createBurstTracker(CONFIG);
	});

	describe("production reports", () => {
		it("turns the Windows handheld report (CapsLock + Shift + digits + Enter) into one 13-digit run", () => {
			const runs = pushAll(tracker, replayReport(windows));

			expect(runs).toHaveLength(1);
			const [run] = runs;
			expect(run.digits).toBe("0221013001345");
			expect(run.keys).toHaveLength(13);
			expect(run.terminator).toBe("enter");
			expect(run.prefixKinds).toEqual(["capslock", "modifier"]);
			expect(run.keys.every((key) => key.shifted)).toBe(true);
			expect(run.keys.every((key) => key.kind === "digit")).toBe(true);
			expect(run.keys.every((key) => key.keyMatchesCode)).toBe(true);
			expect(Math.max(...run.keys.slice(1).map((key) => key.gapMs ?? 0))).toBe(
				33,
			);
		});

		it("turns the Android IME report (12 Unidentified keys + Enter) into one run with no readable digits", () => {
			const runs = pushAll(tracker, replayReport(android));

			expect(runs).toHaveLength(1);
			const [run] = runs;
			expect(run.digits).toBeNull();
			expect(run.keys).toHaveLength(12);
			expect(run.keys.every((key) => key.kind === "unidentified")).toBe(true);
			expect(run.terminator).toBe("enter");
			expect(run.prefixKinds).toEqual([]);
		});
	});

	describe("run boundaries", () => {
		it("discards a run shorter than the minimum length", () => {
			const keys = [...digitRun(0, 20, 4), keyAt(100, "Enter", "Enter")];

			expect(pushAll(tracker, keys)).toEqual([]);
		});

		it("does not form a run when the gaps exceed the maximum interval", () => {
			const keys = [...digitRun(0, 150, 6), keyAt(1_000, "Enter", "Enter")];

			expect(pushAll(tracker, keys)).toEqual([]);
		});

		it("reports a run without terminator when flushed after the last key", () => {
			pushAll(tracker, digitRun(0, 20, 13));

			const run = tracker.flush(400);

			expect(run?.terminator).toBe("none");
			expect(run?.digits).toBe("1234567890123");
		});

		it("flush returns nothing when no run is open or the open run is too short", () => {
			expect(tracker.flush(100)).toBeNull();
			pushAll(tracker, digitRun(0, 20, 3));
			expect(tracker.flush(400)).toBeNull();
		});

		it("accepts Tab as a terminator", () => {
			const keys = [...digitRun(0, 20, 8), keyAt(180, "Tab", "Tab")];

			const [run] = pushAll(tracker, keys);

			expect(run.terminator).toBe("tab");
		});

		it("closes the previous run with no terminator when a key arrives after a long pause", () => {
			const first = digitRun(0, 20, 8);
			const runs = pushAll(tracker, [...first, keyAt(2_000, "7")]);

			expect(runs).toHaveLength(1);
			expect(runs[0].terminator).toBe("none");
			expect(runs[0].keys).toHaveLength(8);
		});

		it("ignores an Enter typed by a human long after the last fast key", () => {
			const keys = [...digitRun(0, 20, 8), keyAt(2_000, "Enter", "Enter")];

			const runs = pushAll(tracker, keys);

			expect(runs).toHaveLength(1);
			expect(runs[0].terminator).toBe("none");
		});

		it("keeps two consecutive scans independent", () => {
			const runs = pushAll(tracker, [
				...digitRun(0, 20, 13),
				keyAt(300, "Enter", "Enter"),
				...digitRun(2_000, 20, 13),
				keyAt(2_300, "Enter", "Enter"),
			]);

			expect(runs).toHaveLength(2);
			expect(runs.map((run) => run.terminator)).toEqual(["enter", "enter"]);
		});

		it("discards the run when a control key is pressed in the middle", () => {
			const keys = [
				...digitRun(0, 20, 6),
				keyAt(130, "ArrowLeft", "ArrowLeft"),
				keyAt(150, "Enter", "Enter"),
			];

			expect(pushAll(tracker, keys)).toEqual([]);
		});

		it("discards the run when Ctrl is held (a shortcut, not a scan)", () => {
			const keys = [
				...digitRun(0, 20, 6),
				keyAt(130, "v", "KeyV", { ctrlKey: true }),
				keyAt(150, "Enter", "Enter"),
			];

			expect(pushAll(tracker, keys)).toEqual([]);
		});
	});

	describe("content", () => {
		it("keeps digits null when a non-digit character is part of the run", () => {
			const keys = [
				keyAt(0, "A", "KeyA"),
				...digitRun(20, 20, 6),
				keyAt(160, "Enter", "Enter"),
			];

			const [run] = pushAll(tracker, keys);

			expect(run.keys).toHaveLength(7);
			expect(run.digits).toBeNull();
			expect(run.keys[0].kind).toBe("char");
		});

		it("marks a digit whose key differs from its code (AZERTY scanner without Shift)", () => {
			const keys = [
				keyAt(0, "&", "Digit1"),
				...digitRun(20, 20, 5),
				keyAt(140, "Enter", "Enter"),
			];

			const [run] = pushAll(tracker, keys);

			expect(run.keys.map((key) => key.keyMatchesCode)).toEqual([
				false,
				true,
				true,
				true,
				true,
				true,
			]);
		});

		it("leaves keyMatchesCode null for keys that are not digits", () => {
			const keys = [
				...Array.from({ length: 6 }, () => "Unidentified").map((key, i) =>
					keyAt(i * 20, key, ""),
				),
				keyAt(140, "Enter", "Enter"),
			];

			const [run] = pushAll(tracker, keys);

			expect(run.keys.every((key) => key.keyMatchesCode === null)).toBe(true);
		});

		it("reads numpad digits like top-row digits", () => {
			const keys = Array.from({ length: 6 }, (_, i) =>
				keyAt(i * 20, String(i), `Numpad${i}`),
			);

			const [run] = pushAll(tracker, [...keys, keyAt(140, "Enter", "Enter")]);

			expect(run.digits).toBe("012345");
		});

		it("ignores a CapsLock pressed long before the burst", () => {
			const keys = [
				keyAt(0, "CapsLock", "CapsLock"),
				...digitRun(5_000, 20, 6),
				keyAt(5_140, "Enter", "Enter"),
			];

			const [run] = pushAll(tracker, keys);

			expect(run.prefixKinds).toEqual([]);
		});

		it("measures the duration from the first to the last content key", () => {
			const [run] = pushAll(tracker, [
				...digitRun(0, 20, 6),
				keyAt(140, "Enter", "Enter"),
			]);

			expect(run.durationMs).toBe(100);
		});
	});
});

describe("burst tracker: trailing digits and idle close", () => {
	const config = { maxIntervalMs: 100, minLength: 5 };

	it("keeps only the digits typed after the last non-digit key", () => {
		const tracker = createBurstTracker(config);
		tracker.push(keyAt(1_000, "A", "KeyA"));
		for (let i = 0; i < 6; i++) tracker.push(keyAt(1_020 + i * 20, "7"));
		const run = tracker.push(keyAt(1_200, "Enter", "Enter"));

		expect(run?.trailingDigits).toBe("777777");
		expect(run?.digits).toBeNull();
	});

	it("ends the open run with the idle terminator", () => {
		const tracker = createBurstTracker(config);
		for (let i = 0; i < 6; i++) tracker.push(keyAt(1_000 + i * 20, "4"));
		const run = tracker.close("idle");

		expect(run?.terminator).toBe("idle");
		expect(run?.trailingDigits).toBe("444444");
		expect(tracker.close("idle")).toBeNull();
	});
});
