import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBarcodeScanner } from "../src/use-barcode-scanner";

type Key = { key: string; code: string; delta: number };

// Real capture of a scanner configured without an Enter suffix: the burst just stops.
const CAPTURED_STREAM_WITHOUT_ENTER: Key[] = [
	{ key: "Shift", code: "ShiftLeft", delta: 0 },
	{ key: "2", code: "Digit2", delta: 0 },
	{ key: "0", code: "Digit0", delta: 19 },
	{ key: "5", code: "Digit5", delta: 6 },
	{ key: "0", code: "Digit0", delta: 8 },
	{ key: "Shift", code: "ShiftLeft", delta: 8 },
	{ key: "0", code: "Digit0", delta: 0 },
	{ key: "Shift", code: "ShiftLeft", delta: 3 },
	{ key: "0", code: "Digit0", delta: 0 },
	{ key: "Shift", code: "ShiftLeft", delta: 5 },
	{ key: "0", code: "Digit0", delta: 1 },
	{ key: "Shift", code: "ShiftLeft", delta: 6 },
	{ key: "0", code: "Digit0", delta: 0 },
	{ key: "3", code: "Digit3", delta: 10 },
	{ key: "4", code: "Digit4", delta: 13 },
	{ key: "2", code: "Digit2", delta: 4 },
	{ key: "0", code: "Digit0", delta: 3 },
];

function press({ key, code }: Pick<Key, "key" | "code">) {
	window.dispatchEvent(
		new KeyboardEvent("keydown", { key, code, cancelable: true }),
	);
}

function play(stream: Key[], startAt = 1_000_000): number {
	let now = startAt;
	for (const step of stream) {
		now += step.delta;
		vi.setSystemTime(now);
		press(step);
	}
	return now;
}

function typeDigits(digits: string, gapMs: number, startAt = 2_000_000) {
	let now = startAt;
	for (const digit of digits) {
		now += gapMs;
		vi.setSystemTime(now);
		press({ key: digit, code: `Digit${digit}` });
	}
	return now;
}

describe("useBarcodeScanner with a scanner that sends no Enter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("delivers the burst once the keys stop arriving", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		play(CAPTURED_STREAM_WITHOUT_ENTER);
		expect(onScan).not.toHaveBeenCalled();

		vi.advanceTimersByTime(200);

		expect(onScan).toHaveBeenCalledTimes(1);
		expect(onScan).toHaveBeenCalledWith("205000003420");
	});

	it("delivers a burst only once when Enter arrives before the idle timeout", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		const end = play(CAPTURED_STREAM_WITHOUT_ENTER);
		vi.setSystemTime(end + 3);
		press({ key: "Enter", code: "Enter" });
		vi.advanceTimersByTime(500);

		expect(onScan).toHaveBeenCalledTimes(1);
		expect(onScan).toHaveBeenCalledWith("205000003420");
	});

	it("does not deliver a burst shorter than minLength", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		typeDigits("1234", 10);
		vi.advanceTimersByTime(500);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("does not deliver digits typed at human speed", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		typeDigits("12345678", 250);
		vi.advanceTimersByTime(500);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("drops the pending burst when a non-digit key interrupts it", () => {
		const onScan = vi.fn();
		renderHook(() => useBarcodeScanner({ enabled: true, onScan }));

		const end = typeDigits("123456", 10);
		vi.setSystemTime(end + 5);
		press({ key: "a", code: "KeyA" });
		vi.advanceTimersByTime(500);

		expect(onScan).not.toHaveBeenCalled();
	});

	it("does not deliver after the hook is disabled", () => {
		const onScan = vi.fn();
		const { rerender } = renderHook(
			({ enabled }) => useBarcodeScanner({ enabled, onScan }),
			{ initialProps: { enabled: true } },
		);

		typeDigits("123456", 10);
		rerender({ enabled: false });
		vi.advanceTimersByTime(500);

		expect(onScan).not.toHaveBeenCalled();
	});
});
