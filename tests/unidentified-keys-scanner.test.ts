import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBarcodeScanner } from "../src/use-barcode-scanner";

// Capture from a handheld scanner on Android 10 / Samsung Internet 30: every
// digit keydown is { key: "Unidentified", code: "" }, only Enter is identified.
// The digits are not in the keydown, so they can only come from the text
// channel (beforeinput/input `data`), which the IME fires for each character.
const SCANNED_CODE = "203101028861";
const DELTAS = [0, 15, 11, 6, 3, 6, 34, 13, 23, 29, 42, 15];
const ENTER_DELTA = 62;

function dispatchScan() {
	let now = 1_000_000;
	[...SCANNED_CODE].forEach((digit, index) => {
		now += DELTAS[index];
		vi.setSystemTime(now);
		window.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Unidentified",
				code: "",
				cancelable: true,
			}),
		);
		window.dispatchEvent(
			new InputEvent("input", { data: digit, inputType: "insertText" }),
		);
	});
	now += ENTER_DELTA;
	vi.setSystemTime(now);
	window.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Enter",
			code: "Enter",
			cancelable: true,
		}),
	);
}

describe("useBarcodeScanner with Unidentified keydowns (Android IME)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("delivers the code read from the input events when keydowns are Unidentified", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		dispatchScan();

		expect(onScan).toHaveBeenCalledTimes(1);
		expect(onScan).toHaveBeenCalledWith(SCANNED_CODE);
	});

	it("does not count digits twice when keydowns carry a usable code", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		let now = 1_000_000;
		for (const digit of SCANNED_CODE) {
			now += 5;
			vi.setSystemTime(now);
			window.dispatchEvent(
				new KeyboardEvent("keydown", { key: digit, code: `Digit${digit}` }),
			);
			window.dispatchEvent(
				new InputEvent("input", { data: digit, inputType: "insertText" }),
			);
		}
		now += 5;
		vi.setSystemTime(now);
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }),
		);

		expect(onScan).toHaveBeenCalledTimes(1);
		expect(onScan).toHaveBeenCalledWith(SCANNED_CODE);
	});

	it("ignores non-digit input data", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		let now = 1_000_000;
		for (const char of "ABCDEFGH") {
			now += 5;
			vi.setSystemTime(now);
			window.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Unidentified", code: "" }),
			);
			window.dispatchEvent(
				new InputEvent("input", { data: char, inputType: "insertText" }),
			);
		}
		now += 5;
		vi.setSystemTime(now);
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }),
		);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("drops slow human typing in the text channel", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		let now = 1_000_000;
		for (const digit of SCANNED_CODE) {
			now += 400;
			vi.setSystemTime(now);
			window.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Unidentified", code: "" }),
			);
			window.dispatchEvent(
				new InputEvent("input", { data: digit, inputType: "insertText" }),
			);
		}
		now += 5;
		vi.setSystemTime(now);
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }),
		);

		expect(onScan).not.toHaveBeenCalled();
	});
});
