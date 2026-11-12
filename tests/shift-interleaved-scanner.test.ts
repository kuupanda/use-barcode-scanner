import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBarcodeScanner } from "../src/use-barcode-scanner";

// Real capture of a French-layout scanner on Windows: Shift is pressed and
// released between digits, so Shift keydowns arrive in the middle of the burst.
const CAPTURED_STREAM: { key: string; code: string; delta: number }[] = [
	{ key: "Shift", code: "ShiftLeft", delta: 0 },
	{ key: "2", code: "Digit2", delta: 0 },
	{ key: "3", code: "Digit3", delta: 10 },
	{ key: "0", code: "Digit0", delta: 3 },
	{ key: "4", code: "Digit4", delta: 6 },
	{ key: "0", code: "Digit0", delta: 5 },
	{ key: "Shift", code: "ShiftLeft", delta: 7 },
	{ key: "0", code: "Digit0", delta: 0 },
	{ key: "Shift", code: "ShiftLeft", delta: 6 },
	{ key: "0", code: "Digit0", delta: 0 },
	{ key: "Shift", code: "ShiftLeft", delta: 3 },
	{ key: "0", code: "Digit0", delta: 0 },
	{ key: "2", code: "Digit2", delta: 3 },
	{ key: "5", code: "Digit5", delta: 3 },
	{ key: "3", code: "Digit3", delta: 4 },
	{ key: "6", code: "Digit6", delta: 4 },
	{ key: "9", code: "Digit9", delta: 3 },
	{ key: "Enter", code: "Enter", delta: 3 },
];

describe("useBarcodeScanner with Shift keydowns inside the burst", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("delivers the full code when Shift is pressed between digits", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		let now = 1_000_000;
		for (const { key, code, delta } of CAPTURED_STREAM) {
			now += delta;
			vi.setSystemTime(now);
			window.dispatchEvent(
				new KeyboardEvent("keydown", {
					key,
					code,
					shiftKey: key !== "Enter",
					cancelable: true,
				}),
			);
		}

		expect(onScan).toHaveBeenCalledTimes(1);
		expect(onScan).toHaveBeenCalledWith("2304000025369");
	});
});
