import { classifyKey, type KeyKind } from "./key-classifier";
import type { KeyInput } from "./key-input";

export type ContentKind = Extract<
	KeyKind,
	"digit" | "numpad" | "unidentified" | "char"
>;

export interface RunKey {
	kind: ContentKind;
	gapMs: number | null;
	shifted: boolean;
	/** For digits: whether `key` is the digit itself. Null for other kinds. */
	keyMatchesCode: boolean | null;
}

export interface KeyRun {
	keys: RunKey[];
	prefixKinds: Array<"capslock" | "modifier">;
	terminator: "enter" | "tab" | "idle" | "none";
	durationMs: number;
	/** Set only when every content key is a digit; never carries other characters. */
	digits: string | null;
	/** The digits typed after the last non-digit key: what a scan would deliver. */
	trailingDigits: string;
}

export interface BurstTrackerConfig {
	maxIntervalMs: number;
	minLength: number;
}

export interface BurstTracker {
	push(input: KeyInput): KeyRun | null;
	flush(now: number): KeyRun | null;
	/** Ends the open run now, for an idle flush. */
	close(terminator: "idle"): KeyRun | null;
	/** How many digits trail the open run so far; null when no run is open. */
	openTrailingDigits(): number | null;
}

interface OpenRun {
	keys: RunKey[];
	prefixKinds: KeyRun["prefixKinds"];
	firstTimestamp: number;
	lastTimestamp: number;
	digits: string | null;
	trailingDigits: string;
}

interface PendingPrefix {
	kinds: KeyRun["prefixKinds"];
	lastTimestamp: number;
}

const CONTENT_KINDS = new Set<KeyKind>([
	"digit",
	"numpad",
	"unidentified",
	"char",
]);

export function createBurstTracker({
	maxIntervalMs,
	minLength,
}: BurstTrackerConfig): BurstTracker {
	let run: OpenRun | null = null;
	let prefix: PendingPrefix | null = null;

	function closeRun(terminator: KeyRun["terminator"]): KeyRun | null {
		const closed = run;
		run = null;
		if (!closed || closed.keys.length < minLength) return null;
		return {
			keys: closed.keys,
			prefixKinds: closed.prefixKinds,
			terminator,
			durationMs: closed.lastTimestamp - closed.firstTimestamp,
			digits: closed.digits,
			trailingDigits: closed.trailingDigits,
		};
	}

	function takePrefix(timestamp: number): KeyRun["prefixKinds"] {
		const taken =
			prefix && timestamp - prefix.lastTimestamp <= maxIntervalMs
				? prefix.kinds
				: [];
		prefix = null;
		return taken;
	}

	function digitOf(input: KeyInput, kind: ContentKind): string | null {
		return kind === "digit" || kind === "numpad" ? input.code.slice(-1) : null;
	}

	function addContentKey(input: KeyInput, kind: ContentKind): KeyRun | null {
		let emitted: KeyRun | null = null;
		if (run && input.timestamp - run.lastTimestamp > maxIntervalMs) {
			emitted = closeRun("none");
		}
		const digit = digitOf(input, kind);
		if (!run) {
			run = {
				keys: [],
				prefixKinds: takePrefix(input.timestamp),
				firstTimestamp: input.timestamp,
				lastTimestamp: input.timestamp,
				digits: "",
				trailingDigits: "",
			};
		}
		run.keys.push({
			kind,
			gapMs: run.keys.length ? input.timestamp - run.lastTimestamp : null,
			shifted: input.shiftKey,
			keyMatchesCode: digit === null ? null : input.key === digit,
		});
		run.lastTimestamp = input.timestamp;
		run.digits =
			run.digits !== null && digit !== null ? run.digits + digit : null;
		run.trailingDigits = digit === null ? "" : run.trailingDigits + digit;
		return emitted;
	}

	function addPrefixKey(input: KeyInput, kind: "capslock" | "modifier") {
		if (run) return;
		const stale =
			!prefix || input.timestamp - prefix.lastTimestamp > maxIntervalMs;
		prefix = {
			kinds: stale ? [kind] : [...(prefix?.kinds ?? []), kind],
			lastTimestamp: input.timestamp,
		};
	}

	function push(input: KeyInput): KeyRun | null {
		const kind = classifyKey(input);

		if (kind === "modifier" || kind === "capslock") {
			addPrefixKey(input, kind);
			return null;
		}

		const isShortcut = input.ctrlKey || input.metaKey;
		if (kind === "control" || isShortcut) {
			run = null;
			prefix = null;
			return null;
		}

		if (CONTENT_KINDS.has(kind)) {
			return addContentKey(input, kind as ContentKind);
		}

		// Enter or Tab
		prefix = null;
		if (!run) return null;
		const terminator =
			input.timestamp - run.lastTimestamp <= maxIntervalMs
				? (kind as "enter" | "tab")
				: "none";
		return closeRun(terminator);
	}

	function flush(now: number): KeyRun | null {
		if (!run || now - run.lastTimestamp <= maxIntervalMs) return null;
		return closeRun("none");
	}

	function close(terminator: "idle"): KeyRun | null {
		return closeRun(terminator);
	}

	function openTrailingDigits(): number | null {
		return run ? run.trailingDigits.length : null;
	}

	return { push, flush, close, openTrailingDigits };
}
