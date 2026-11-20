import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanAttempt } from "../src/keyboard/scan-engine";
import { useBarcodeScanner } from "../src/use-barcode-scanner";

function press(key: string, code: string, atMs: number): boolean {
	vi.setSystemTime(atMs);
	return window.dispatchEvent(
		new KeyboardEvent("keydown", { key, code, cancelable: true }),
	);
}

function burst(digits: string, startAt: number): number {
	let at = startAt;
	for (const digit of digits) {
		press(digit, `Digit${digit}`, at);
		at += 10;
	}
	return at;
}

describe("useBarcodeScanner onAttempt", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("passes the burst to onScan and to onAttempt for a delivered scan", () => {
		const onScan = vi.fn();
		const attempts: ScanAttempt[] = [];
		renderHook(() =>
			useBarcodeScanner({
				enabled: true,
				onScan,
				onAttempt: (attempt) => attempts.push(attempt),
			}),
		);

		const at = burst("3760123456784", 1_000);
		press("Enter", "Enter", at);

		expect(onScan).toHaveBeenCalledWith(
			"3760123456784",
			expect.objectContaining({ delivered: true, trigger: "enter" }),
		);
		expect(attempts).toHaveLength(1);
		expect(attempts[0].delivered).toBe(true);
	});

	it("explains a burst of keys the scanner cannot read", () => {
		const attempts: ScanAttempt[] = [];
		renderHook(() =>
			useBarcodeScanner({
				enabled: true,
				onScan: vi.fn(),
				onAttempt: (attempt) => attempts.push(attempt),
			}),
		);

		let at = 1_000;
		for (let i = 0; i < 8; i++) {
			press("Unidentified", "", at);
			at += 20;
		}
		press("Enter", "Enter", at);

		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({
			delivered: false,
			reason: "unreadable_keys",
		});
	});

	it("keeps watching while disabled and says the scanner was off, without delivering", () => {
		const onScan = vi.fn();
		const attempts: ScanAttempt[] = [];
		renderHook(() =>
			useBarcodeScanner({
				enabled: false,
				onScan,
				onAttempt: (attempt) => attempts.push(attempt),
			}),
		);

		const at = burst("3760123456784", 1_000);
		const notPrevented = press("Enter", "Enter", at);

		expect(onScan).not.toHaveBeenCalled();
		expect(notPrevented).toBe(true);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({ delivered: false, reason: "disabled" });
	});

	it("does not listen at all while disabled and not observing", () => {
		const add = vi.spyOn(window, "addEventListener");
		renderHook(() => useBarcodeScanner({ enabled: false, onScan: vi.fn() }));

		expect(add).not.toHaveBeenCalledWith("keydown", expect.anything());
		add.mockRestore();
	});

	it("keeps a burst going when the callbacks change identity mid-scan", () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = renderHook(
			({ onScan }) => useBarcodeScanner({ enabled: true, onScan }),
			{ initialProps: { onScan: first } },
		);

		const midway = burst("37601", 1_000);
		rerender({ onScan: second });
		const at = burst("23456784", midway);
		press("Enter", "Enter", at);

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith("3760123456784", expect.anything());
	});
});
