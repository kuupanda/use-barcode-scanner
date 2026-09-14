import type { QuaggaJSResultObject } from "@ericblade/quagga2";
import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type UseBarcodeCameraOptions,
	useBarcodeCamera,
} from "../src/use-barcode-camera";

const mockQuagga = vi.hoisted(() => ({
	init: vi.fn(),
	start: vi.fn(),
	stop: vi.fn(),
	onDetected: vi.fn(),
	offDetected: vi.fn(),
	onProcessed: vi.fn(),
	offProcessed: vi.fn(),
}));

vi.mock("@ericblade/quagga2", () => ({
	default: mockQuagga,
}));

function makeQuaggaResult(code: string | null): QuaggaJSResultObject {
	return {
		codeResult: {
			code,
			start: 0,
			end: 0,
			codeset: 0,
			startInfo: { error: 0, code: 0, start: 0, end: 0 },
			decodedCodes: [],
			endInfo: { error: 0, code: 0, start: 0, end: 0 },
			direction: 1,
			format: "ean_13",
		},
		line: [],
		angle: 0,
		pattern: [],
		box: [],
		boxes: [],
	};
}

type HookResult = ReturnType<typeof useBarcodeCamera>;

function TestHarness({
	enabled,
	onScan,
	resultRef,
	...options
}: Omit<UseBarcodeCameraOptions, "enabled" | "onScan"> & {
	enabled: boolean;
	onScan: (code: string) => void;
	resultRef: { current: HookResult | null };
}) {
	const result = useBarcodeCamera({ enabled, onScan, ...options });
	resultRef.current = result;
	return <div ref={result.containerRef} />;
}

function succeedInit() {
	const initCall = mockQuagga.init.mock.calls.at(-1);
	const callback = initCall?.[1] as (err: unknown) => void;
	act(() => callback(null));
}

function failInit(err: unknown) {
	const initCall = mockQuagga.init.mock.calls.at(-1);
	const callback = initCall?.[1] as (err: unknown) => void;
	act(() => callback(err));
}

function fireDetected(code: string | null, atMs?: number) {
	if (atMs !== undefined) vi.setSystemTime(atMs);
	const handler = mockQuagga.onDetected.mock.calls.at(-1)?.[0] as (
		data: QuaggaJSResultObject,
	) => void;
	act(() => handler(makeQuaggaResult(code)));
}

function fireProcessed(code: string | null, atMs?: number) {
	if (atMs !== undefined) vi.setSystemTime(atMs);
	const handler = mockQuagga.onProcessed.mock.calls.at(-1)?.[0] as (
		data: QuaggaJSResultObject,
	) => void;
	act(() => handler(makeQuaggaResult(code)));
}

// Despite QuaggaJSResultObject's own type declaring codeResult as always
// present, real Quagga passes it as a bare `null` when nothing decoded in a
// frame — this is the actual shape that broke onProcessed in production.
function fireProcessedWithNullCodeResult(atMs?: number) {
	if (atMs !== undefined) vi.setSystemTime(atMs);
	const handler = mockQuagga.onProcessed.mock.calls.at(-1)?.[0] as (
		data: QuaggaJSResultObject,
	) => void;
	act(() => handler({ codeResult: null } as unknown as QuaggaJSResultObject));
}

describe("useBarcodeCamera", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should not start the camera when disabled", () => {
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={false} onScan={vi.fn()} resultRef={resultRef} />,
		);

		expect(mockQuagga.init).not.toHaveBeenCalled();
		expect(resultRef.current?.status).toBe("idle");
	});

	it("should restrict decoding to a centered horizontal band", () => {
		// Several barcodes visible at once (e.g. a sheet of labels) must not
		// all decode — only a code that falls in this band should. 80% width
		// (a band, not a square: an EAN-13 needs its full width in frame) and
		// 25% height, so 10% side margins and 37.5% top/bottom margins. The
		// visible frame itself is a separate CSS overlay drawn by the
		// consumer, not Quagga's own border draw (which requires
		// `locate: false`).
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={vi.fn()} resultRef={resultRef} />,
		);

		const config = mockQuagga.init.mock.calls[0][0];
		expect(config.inputStream.area).toEqual({
			left: "10%",
			right: "10%",
			top: "37.5%",
			bottom: "37.5%",
		});
	});

	it("should accept a custom scanArea, merged over the defaults, and return the effective area used", () => {
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness
				enabled={true}
				onScan={vi.fn()}
				resultRef={resultRef}
				scanArea={{ top: "45%", bottom: "45%" }}
			/>,
		);

		const config = mockQuagga.init.mock.calls[0][0];
		const expectedArea = {
			left: "10%",
			right: "10%",
			top: "45%",
			bottom: "45%",
		};
		expect(config.inputStream.area).toEqual(expectedArea);
		expect(resultRef.current?.scanArea).toEqual(expectedArea);
	});

	it("should pass custom dedupe tuning through to the scan session", () => {
		// A shorter missingGraceMs than the 700ms default should let a scan
		// count again sooner after a sustained absence.
		const onScan = vi.fn();
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness
				enabled={true}
				onScan={onScan}
				resultRef={resultRef}
				missingGraceMs={100}
			/>,
		);
		succeedInit();

		fireDetected("3760123456784", 0);
		fireProcessed(null, 10);
		fireProcessed(null, 120); // 110ms since the miss streak began — past the custom 100ms grace
		fireDetected("3760123456784", 130);

		expect(onScan).toHaveBeenCalledTimes(2);
	});

	it("should report running after a successful init", () => {
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={vi.fn()} resultRef={resultRef} />,
		);

		succeedInit();

		expect(mockQuagga.start).toHaveBeenCalledTimes(1);
		expect(resultRef.current?.status).toBe("running");
	});

	it("should report permission-denied when getUserMedia is denied", () => {
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={vi.fn()} resultRef={resultRef} />,
		);

		failInit({ name: "NotAllowedError" });

		expect(resultRef.current?.status).toBe("permission-denied");
	});

	it("should report no-camera when no device is found", () => {
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={vi.fn()} resultRef={resultRef} />,
		);

		failInit({ name: "NotFoundError" });

		expect(resultRef.current?.status).toBe("no-camera");
	});

	it("should report a generic error for anything else", () => {
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={vi.fn()} resultRef={resultRef} />,
		);

		failInit({ name: "NotReadableError" });

		expect(resultRef.current?.status).toBe("error");
	});

	it("should call onScan for a newly detected code", () => {
		const onScan = vi.fn();
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={onScan} resultRef={resultRef} />,
		);
		succeedInit();

		fireDetected("3760123456784");

		expect(onScan).toHaveBeenCalledWith("3760123456784");
	});

	it("should not call onScan again for the same code held continuously in frame", () => {
		const onScan = vi.fn();
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={onScan} resultRef={resultRef} />,
		);
		succeedInit();

		fireDetected("3760123456784");
		fireDetected("3760123456784");

		expect(onScan).toHaveBeenCalledTimes(1);
	});

	it("should not call onScan again for a single brief miss while the same item is still in frame", () => {
		// A lone noisy frame (autofocus hunting, motion blur) must not be
		// mistaken for the item leaving the camera's view — this is the exact
		// burst-duplicate-scan bug reported from real-device testing.
		const onScan = vi.fn();
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={onScan} resultRef={resultRef} />,
		);
		succeedInit();

		fireDetected("3760123456784", 0);
		fireProcessed(null, 50);
		fireDetected("3760123456784", 100);

		expect(onScan).toHaveBeenCalledTimes(1);
	});

	it("should call onScan again once the code has been missing continuously past the grace period (jar swapped for an identical one)", () => {
		const onScan = vi.fn();
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={onScan} resultRef={resultRef} />,
		);
		succeedInit();

		fireDetected("3760123456784", 0);
		fireProcessed(null, 100);
		fireProcessed(null, 850);
		fireDetected("3760123456784", 900);

		expect(onScan).toHaveBeenCalledTimes(2);
	});

	it("should not throw when onProcessed receives a bare-null codeResult", () => {
		const onScan = vi.fn();
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={onScan} resultRef={resultRef} />,
		);
		succeedInit();

		expect(() => fireProcessedWithNullCodeResult(0)).not.toThrow();
	});

	it("should clear the session on a sustained bare-null codeResult, so the same code counts again", () => {
		const onScan = vi.fn();
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<TestHarness enabled={true} onScan={onScan} resultRef={resultRef} />,
		);
		succeedInit();

		fireDetected("3760123456784", 0);
		fireProcessedWithNullCodeResult(100);
		fireProcessedWithNullCodeResult(850);
		fireDetected("3760123456784", 900);

		expect(onScan).toHaveBeenCalledTimes(2);
	});

	it("should not register handlers or start the camera if torn down before init resolves", () => {
		// Simulates the async init callback arriving after React (Strict Mode's
		// dev-only mount→cleanup→remount, or any other unmount) already tore
		// the effect down — a late registration here is exactly what caused
		// two live onDetected handlers and a double onScan per real scan.
		const resultRef = { current: null } as { current: HookResult | null };
		const { unmount } = render(
			<TestHarness enabled={true} onScan={vi.fn()} resultRef={resultRef} />,
		);

		unmount();
		succeedInit();

		expect(mockQuagga.onDetected).not.toHaveBeenCalled();
		expect(mockQuagga.start).not.toHaveBeenCalled();
	});

	it("should register the camera exactly once under React Strict Mode's dev-only double effect invocation", () => {
		const resultRef = { current: null } as { current: HookResult | null };
		render(
			<StrictMode>
				<TestHarness enabled={true} onScan={vi.fn()} resultRef={resultRef} />
			</StrictMode>,
		);

		// Resolve every init call Strict Mode's double-invoke produced — this
		// is the exact race that let a stale handler from the first, torn-down
		// mount stay registered alongside the real one.
		for (const call of mockQuagga.init.mock.calls) {
			const callback = call[1] as (err: unknown) => void;
			act(() => callback(null));
		}

		expect(mockQuagga.onDetected).toHaveBeenCalledTimes(1);
		expect(mockQuagga.start).toHaveBeenCalledTimes(1);
	});

	it("should stop and unregister the camera on unmount", () => {
		const resultRef = { current: null } as { current: HookResult | null };
		const { unmount } = render(
			<TestHarness enabled={true} onScan={vi.fn()} resultRef={resultRef} />,
		);
		succeedInit();

		unmount();

		expect(mockQuagga.stop).toHaveBeenCalledTimes(1);
		expect(mockQuagga.offDetected).toHaveBeenCalledTimes(1);
		expect(mockQuagga.offProcessed).toHaveBeenCalledTimes(1);
	});
});
