"use client";

import { useEffect, useRef } from "react";

// event.key is translated by the OS keyboard layout (e.g. a French AZERTY
// host turns the scanner's digit row into "&é\"'(§è!çà"); event.code names
// the physical key and is layout-independent, so digits are read from there.
// Both the top digit row and the numpad are covered — some scanners are
// configured to emit numpad codes specifically to sidestep this on AZERTY.
const DIGIT_CODES: Record<string, string> = {
	Digit0: "0",
	Digit1: "1",
	Digit2: "2",
	Digit3: "3",
	Digit4: "4",
	Digit5: "5",
	Digit6: "6",
	Digit7: "7",
	Digit8: "8",
	Digit9: "9",
	Numpad0: "0",
	Numpad1: "1",
	Numpad2: "2",
	Numpad3: "3",
	Numpad4: "4",
	Numpad5: "5",
	Numpad6: "6",
	Numpad7: "7",
	Numpad8: "8",
	Numpad9: "9",
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock"]);

export type UseBarcodeScannerOptions = {
	enabled: boolean;
	onScan: (code: string) => void;
	maxIntervalMs?: number;
	minLength?: number;
};

// Captures a HID keyboard-wedge barcode scanner: a fast digit burst
// terminated by Enter, distinguished from human typing by inter-keystroke
// timing. Listens on `window`, so it works regardless of what element has
// focus — exactly how a keyboard-wedge scanner's keystrokes arrive.
export function useBarcodeScanner({
	enabled,
	onScan,
	maxIntervalMs = 100,
	minLength = 5,
}: UseBarcodeScannerOptions): void {
	const bufferRef = useRef("");
	const lastKeyTimeRef = useRef(0);

	useEffect(() => {
		bufferRef.current = "";

		if (!enabled) {
			return;
		}

		function handleKeyDown(e: KeyboardEvent) {
			// Scanners in a non-US layout press and release Shift between digits.
			if (MODIFIER_KEYS.has(e.key)) {
				return;
			}

			const now = Date.now();
			const elapsed = now - lastKeyTimeRef.current;
			lastKeyTimeRef.current = now;

			if (e.key === "Enter") {
				const code = bufferRef.current;
				bufferRef.current = "";
				if (code.length >= minLength && elapsed <= maxIntervalMs) {
					e.preventDefault();
					onScan(code);
				}
				return;
			}

			const digit = DIGIT_CODES[e.code];
			if (!digit) {
				bufferRef.current = "";
				return;
			}

			bufferRef.current =
				elapsed <= maxIntervalMs ? bufferRef.current + digit : digit;
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [enabled, onScan, maxIntervalMs, minLength]);
}
