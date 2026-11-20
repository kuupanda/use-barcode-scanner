import type { KeyRun } from "./burst-tracker";

export type RejectionReason =
	| "disabled"
	| "unreadable_keys"
	| "tab_terminator"
	| "non_digit_chars"
	| "too_short"
	| "unexplained";

// Why a burst of keys did not become a scan, by the same rules the engine delivers with.
export function explainRejection(
	run: KeyRun,
	minLength: number,
): RejectionReason {
	if (run.keys.some((key) => key.kind === "unidentified")) {
		return "unreadable_keys";
	}
	if (run.terminator === "tab") return "tab_terminator";
	if (run.trailingDigits.length >= minLength) return "unexplained";
	return run.keys.some((key) => key.kind === "char")
		? "non_digit_chars"
		: "too_short";
}
