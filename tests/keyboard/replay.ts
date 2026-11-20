import {
	createBurstTracker,
	type KeyRun,
} from "../../src/keyboard/burst-tracker";
import type { KeyInput } from "../../src/keyboard/key-input";

export interface ProducerReportEvent {
	key: string;
	code: string;
	mods: string;
	delta: number;
	repeat: boolean;
}

export interface ProducerReport {
	ua: string;
	platform: string;
	content: string;
	events: ProducerReportEvent[];
}

// Turns a scanner diagnostic report (per-event deltas) into absolute-timestamp key inputs.
export function replayReport(
	report: ProducerReport,
	startAt = 1_000,
): KeyInput[] {
	let timestamp = startAt;
	return report.events.map((event) => {
		timestamp += event.delta;
		return {
			key: event.key,
			code: event.code,
			shiftKey: event.mods.includes("shift"),
			ctrlKey: event.mods.includes("ctrl"),
			altKey: event.mods.includes("alt"),
			metaKey: event.mods.includes("meta"),
			timestamp,
		};
	});
}

// Convenience builder for synthetic sequences: one key every `gapMs`.
export function keyAt(
	timestamp: number,
	key: string,
	code = key.length === 1 && /\d/.test(key) ? `Digit${key}` : key,
	modifiers: Partial<
		Pick<KeyInput, "shiftKey" | "ctrlKey" | "altKey" | "metaKey">
	> = {},
): KeyInput {
	return {
		key,
		code,
		shiftKey: false,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		...modifiers,
		timestamp,
	};
}

// First scanner run found in a replayed report, with the production thresholds.
export function firstRunOf(report: ProducerReport): KeyRun {
	const tracker = createBurstTracker({ maxIntervalMs: 100, minLength: 5 });
	const run = replayReport(report)
		.map((key) => tracker.push(key))
		.find((candidate) => candidate !== null);
	if (!run) throw new Error("report contains no scanner run");
	return run;
}
