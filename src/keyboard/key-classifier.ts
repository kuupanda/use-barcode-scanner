import type { KeyInput } from "./key-input";

export type KeyKind =
	| "digit"
	| "numpad"
	| "unidentified"
	| "char"
	| "modifier"
	| "capslock"
	| "enter"
	| "tab"
	| "control";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta"]);

export function classifyKey({
	key,
	code,
}: Pick<KeyInput, "key" | "code">): KeyKind {
	if (key === "Enter") return "enter";
	if (key === "Tab") return "tab";
	if (key === "CapsLock") return "capslock";
	if (MODIFIER_KEYS.has(key)) return "modifier";
	if (/^Digit\d$/.test(code)) return "digit";
	if (/^Numpad\d$/.test(code)) return "numpad";
	if (key === "Unidentified") return "unidentified";
	if (key.length === 1) return "char";
	return "control";
}
