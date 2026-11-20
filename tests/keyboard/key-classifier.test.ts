import { describe, expect, it } from "vitest";
import { classifyKey } from "../../src/keyboard/key-classifier";
import { keyAt } from "./replay";

describe("classifyKey", () => {
	it("classifies a top-row digit by its code", () => {
		expect(classifyKey(keyAt(0, "0", "Digit0"))).toBe("digit");
	});

	it("classifies a digit by code even when the key is the shifted symbol (AZERTY without Shift)", () => {
		expect(classifyKey(keyAt(0, "&", "Digit1"))).toBe("digit");
	});

	it("classifies a numpad digit", () => {
		expect(classifyKey(keyAt(0, "3", "Numpad3"))).toBe("numpad");
	});

	it("classifies the Android IME key (key Unidentified, empty code)", () => {
		expect(classifyKey(keyAt(0, "Unidentified", ""))).toBe("unidentified");
	});

	it.each(["Shift", "Control", "Alt", "AltGraph", "Meta"])(
		"classifies %s as a modifier",
		(key) => {
			expect(classifyKey(keyAt(0, key, `${key}Left`))).toBe("modifier");
		},
	);

	it("classifies CapsLock on its own", () => {
		expect(classifyKey(keyAt(0, "CapsLock", "CapsLock"))).toBe("capslock");
	});

	it("classifies Enter and Tab as terminators", () => {
		expect(classifyKey(keyAt(0, "Enter", "Enter"))).toBe("enter");
		expect(classifyKey(keyAt(0, "Tab", "Tab"))).toBe("tab");
	});

	it("classifies a printable non-digit character", () => {
		expect(classifyKey(keyAt(0, "a", "KeyA"))).toBe("char");
		expect(classifyKey(keyAt(0, "-", "Minus"))).toBe("char");
	});

	it.each(["ArrowLeft", "Backspace", "Escape", "F5"])(
		"classifies %s as a control key",
		(key) => {
			expect(classifyKey(keyAt(0, key, key))).toBe("control");
		},
	);
});
