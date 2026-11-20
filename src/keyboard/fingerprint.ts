import type { KeyRun } from "./burst-tracker";

export interface ScanFingerprint {
	keyStyle: "code_digit" | "code_numpad" | "key_unidentified" | "mixed";
	shifted: "all" | "some" | "none";
	capslock: boolean;
	prefixModifier: boolean;
	terminator: KeyRun["terminator"];
	length: number;
	allDigits: boolean;
	keyMismatchCount: number;
	gapP50Ms: number;
	gapP95Ms: number;
	gapMaxMs: number;
	durationMs: number;
}

export function percentile(values: number[], percent: number): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.ceil((percent / 100) * sorted.length);
	return sorted[Math.max(rank, 1) - 1];
}

function keyStyleOf(run: KeyRun): ScanFingerprint["keyStyle"] {
	const kinds = new Set(run.keys.map((key) => key.kind));
	if (kinds.size === 1) {
		const [kind] = kinds;
		if (kind === "digit") return "code_digit";
		if (kind === "numpad") return "code_numpad";
		if (kind === "unidentified") return "key_unidentified";
	}
	return "mixed";
}

function shiftedOf(run: KeyRun): ScanFingerprint["shifted"] {
	const shiftedCount = run.keys.filter((key) => key.shifted).length;
	if (shiftedCount === 0) return "none";
	return shiftedCount === run.keys.length ? "all" : "some";
}

export function buildFingerprint(run: KeyRun): ScanFingerprint {
	const gaps = run.keys.flatMap((key) =>
		key.gapMs === null ? [] : [key.gapMs],
	);
	return {
		keyStyle: keyStyleOf(run),
		shifted: shiftedOf(run),
		capslock: run.prefixKinds.includes("capslock"),
		prefixModifier: run.prefixKinds.includes("modifier"),
		terminator: run.terminator,
		length: run.keys.length,
		allDigits: run.digits !== null,
		keyMismatchCount: run.keys.filter((key) => key.keyMatchesCode === false)
			.length,
		gapP50Ms: percentile(gaps, 50),
		gapP95Ms: percentile(gaps, 95),
		gapMaxMs: Math.max(0, ...gaps),
		durationMs: run.durationMs,
	};
}
