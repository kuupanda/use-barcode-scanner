import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBarcodeScanner } from "../src/use-barcode-scanner";

const DIGIT_CODE: Record<string, string> = {
	"0": "Digit0",
	"1": "Digit1",
	"2": "Digit2",
	"3": "Digit3",
	"4": "Digit4",
	"5": "Digit5",
	"6": "Digit6",
	"7": "Digit7",
	"8": "Digit8",
	"9": "Digit9",
};

function pressDigit(
	digit: string,
	atMs: number,
	code = DIGIT_CODE[digit],
): boolean {
	vi.setSystemTime(atMs);
	return window.dispatchEvent(
		new KeyboardEvent("keydown", { key: digit, code, cancelable: true }),
	);
}

function pressEnter(atMs: number): boolean {
	vi.setSystemTime(atMs);
	return window.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Enter",
			code: "Enter",
			cancelable: true,
		}),
	);
}

function pressNonDigit(atMs: number): boolean {
	vi.setSystemTime(atMs);
	return window.dispatchEvent(
		new KeyboardEvent("keydown", { key: "a", code: "KeyA", cancelable: true }),
	);
}

describe("useBarcodeScanner", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should call onScan with the buffered code on a fast digit burst terminated by Enter", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		pressDigit("1", 0);
		pressDigit("2", 10);
		pressDigit("3", 20);
		pressDigit("4", 30);
		pressDigit("5", 40);
		pressEnter(50);

		expect(onScan).toHaveBeenCalledWith("12345");
		expect(onScan).toHaveBeenCalledTimes(1);
	});

	it("should read digits from event.code, ignoring a mistranslated event.key from a non-US OS keyboard layout", () => {
		// A French AZERTY host turns a scanner's digit-row keydowns into
		// symbols (event.key = "é", '"', etc.) while event.code still names
		// the physical key (Digit2, Digit3, ...) — a real bug seen testing
		// with a real scanner on an AZERTY machine.
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		pressDigit("é", 0, "Digit2");
		pressDigit('"', 10, "Digit3");
		pressDigit("'", 20, "Digit4");
		pressDigit("(", 30, "Digit5");
		pressDigit("§", 40, "Digit6");
		pressEnter(50);

		expect(onScan).toHaveBeenCalledWith("23456");
	});

	it("should not call onScan for slow, human-paced digit entry", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		pressDigit("1", 0);
		pressDigit("2", 200);
		pressDigit("3", 400);
		pressDigit("4", 600);
		pressDigit("5", 800);
		pressEnter(1000);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("should not call onScan when Enter arrives with an empty buffer", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		pressEnter(0);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("should ignore all keystrokes when disabled", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: false, onScan }));

		pressDigit("1", 0);
		pressDigit("2", 10);
		pressDigit("3", 20);
		pressDigit("4", 30);
		pressDigit("5", 40);
		pressEnter(50);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("should prevent the default Enter behavior only when a scan is recognized", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		pressDigit("1", 0);
		pressDigit("2", 10);
		pressDigit("3", 20);
		pressDigit("4", 30);
		pressDigit("5", 40);
		const notCanceled = pressEnter(50);
		expect(notCanceled).toBe(false);

		const notCanceledAgain = pressEnter(1000);
		expect(notCanceledAgain).toBe(true);
	});

	it("should reset the buffer on a non-digit keystroke", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		pressDigit("1", 0);
		pressDigit("2", 10);
		pressNonDigit(20);
		pressEnter(30);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("should stop listening once disabled", () => {
		const onScan = vi.fn();
		const { rerender } = renderHook(
			({ enabled }) => useBarcodeScanner({ enabled, onScan }),
			{ initialProps: { enabled: true } },
		);

		pressDigit("1", 0);
		pressDigit("2", 10);
		pressDigit("3", 20);
		rerender({ enabled: false });
		pressDigit("4", 30);
		pressDigit("5", 40);
		pressEnter(50);

		expect(onScan).not.toHaveBeenCalled();
	});
});
