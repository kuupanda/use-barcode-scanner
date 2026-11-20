import {
	type BurstTracker,
	createBurstTracker,
	type KeyRun,
} from "./burst-tracker";
import { classifyKey } from "./key-classifier";
import type { KeyInput } from "./key-input";
import { explainRejection, type RejectionReason } from "./rejection";

export interface ScanEngineConfig {
	maxIntervalMs: number;
	minLength: number;
	idleFlushMs: number;
}

export type ScanAttempt =
	| {
			delivered: true;
			code: string;
			trigger: "enter" | "idle";
			run: KeyRun;
	  }
	| { delivered: false; reason: RejectionReason; run: KeyRun };

export type DeliveredAttempt = Extract<ScanAttempt, { delivered: true }>;

export interface ScanEngineIo {
	onScan(code: string, attempt: DeliveredAttempt): void;
	/** Called for every burst the engine saw, delivered or not. */
	onAttempt?(attempt: ScanAttempt): void;
	/** Watch bursts and explain them, but never deliver (the scanner is off). */
	observeOnly?: boolean;
	schedule(task: () => void, delayMs: number): unknown;
	cancel(handle: unknown): void;
}

export interface ScanEngine {
	/** `consumed` is true when the key was the Enter that delivered a scan. */
	handleKey(input: KeyInput): { consumed: boolean };
	dispose(): void;
}

// Margin so that a quiet burst is judged after the scanner's own timers.
const QUIET_MARGIN_MS = 10;

// Pure keyboard-wedge scan logic: no DOM, React or timers of its own.
export function createScanEngine(
	{ maxIntervalMs, minLength, idleFlushMs }: ScanEngineConfig,
	{ onScan, onAttempt, observeOnly = false, schedule, cancel }: ScanEngineIo,
): ScanEngine {
	const tracker: BurstTracker = createBurstTracker({
		maxIntervalMs,
		minLength,
	});
	let timer: unknown = null;
	let disposed = false;

	function clearTimer() {
		if (timer === null) return;
		cancel(timer);
		timer = null;
	}

	function isDeliverable(run: KeyRun): boolean {
		return (
			(run.terminator === "enter" || run.terminator === "idle") &&
			run.trailingDigits.length >= minLength
		);
	}

	// Returns whether a scan was delivered.
	function settle(run: KeyRun, trigger: "enter" | "idle"): boolean {
		if (observeOnly) {
			onAttempt?.({ delivered: false, reason: "disabled", run });
			return false;
		}
		if (!isDeliverable(run)) {
			onAttempt?.({
				delivered: false,
				reason: explainRejection(run, minLength),
				run,
			});
			return false;
		}
		const attempt: DeliveredAttempt = {
			delivered: true,
			code: run.trailingDigits,
			trigger,
			run,
		};
		onScan(attempt.code, attempt);
		onAttempt?.(attempt);
		return true;
	}

	// Flushing sooner than a gap that still belongs to the burst would cut slow scanners in two.
	const idleDelayMs = Math.max(idleFlushMs, maxIntervalMs + 1);

	function armTimer() {
		clearTimer();
		const trailing = tracker.openTrailingDigits();
		if (trailing === null) return;
		const idle = trailing >= minLength;
		timer = schedule(
			() => {
				timer = null;
				const closed = idle ? tracker.close("idle") : tracker.flush(Infinity);
				if (closed) settle(closed, "idle");
			},
			idle ? idleDelayMs : maxIntervalMs + QUIET_MARGIN_MS,
		);
	}

	return {
		handleKey(input) {
			if (disposed) return { consumed: false };
			const closed = tracker.push(input);
			const kind = classifyKey(input);
			// Modifier keys never touch the burst timing, same as a scanner pressing Shift.
			if (kind === "modifier" || kind === "capslock")
				return { consumed: false };
			let consumed = false;
			if (closed) {
				consumed = settle(closed, "enter") && closed.terminator === "enter";
			}
			armTimer();
			return { consumed };
		},
		dispose() {
			disposed = true;
			clearTimer();
		},
	};
}
