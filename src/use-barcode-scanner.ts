"use client";

import { useEffect, useRef } from "react";

import {
	createScanEngine,
	type DeliveredAttempt,
	type ScanAttempt,
} from "./keyboard/scan-engine";

export type UseBarcodeScannerOptions = {
	enabled: boolean;
	/** `attempt` describes the burst of keys the code came from. */
	onScan: (code: string, attempt: DeliveredAttempt) => void;
	/**
	 * Called for every burst of scanner-like keys, delivered or not, with the
	 * reason when it was not. While `enabled` is false it still fires (reason
	 * `disabled`) so a dialog swallowing scans is visible.
	 */
	onAttempt?: (attempt: ScanAttempt) => void;
	maxIntervalMs?: number;
	minLength?: number;
	// Idle time after which a burst is delivered even without a trailing Enter,
	// for scanners configured with no suffix.
	idleFlushMs?: number;
};

// Captures a HID keyboard-wedge barcode scanner: a fast digit burst
// terminated by Enter, distinguished from human typing by inter-keystroke
// timing. Listens on `window`, so it works regardless of what element has
// focus — exactly how a keyboard-wedge scanner's keystrokes arrive.
export function useBarcodeScanner({
	enabled,
	onScan,
	onAttempt,
	maxIntervalMs = 100,
	minLength = 5,
	idleFlushMs = 50,
}: UseBarcodeScannerOptions): void {
	const callbacks = useRef({ onScan, onAttempt });
	callbacks.current = { onScan, onAttempt };
	const observing = onAttempt !== undefined;

	useEffect(() => {
		if (!enabled && !observing) {
			return;
		}

		const engine = createScanEngine(
			{ maxIntervalMs, minLength, idleFlushMs },
			{
				onScan: (code, attempt) => callbacks.current.onScan(code, attempt),
				onAttempt: (attempt) => callbacks.current.onAttempt?.(attempt),
				observeOnly: !enabled,
				schedule: (task, delayMs) => setTimeout(task, delayMs),
				cancel: (handle) =>
					clearTimeout(handle as ReturnType<typeof setTimeout>),
			},
		);

		function handleKeyDown(e: KeyboardEvent) {
			const { consumed } = engine.handleKey({
				key: e.key,
				code: e.code,
				shiftKey: e.shiftKey,
				ctrlKey: e.ctrlKey,
				altKey: e.altKey,
				metaKey: e.metaKey,
				timestamp: Date.now(),
			});
			if (consumed) {
				e.preventDefault();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			engine.dispose();
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [enabled, observing, maxIntervalMs, minLength, idleFlushMs]);
}
