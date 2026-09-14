"use client";

import Quagga, {
	type QuaggaJSCodeReader,
	type QuaggaJSReaderConfig,
	type QuaggaJSResultObject,
} from "@ericblade/quagga2";
import { type RefObject, useEffect, useRef, useState } from "react";
import {
	createScanSession,
	registerDetection,
	registerMiss,
	type ScanSessionConfig,
	type ScanSessionState,
} from "./scan-session";

export type ScanArea = {
	left: string;
	right: string;
	top: string;
	bottom: string;
};

// A band, not a square: an EAN-13 needs its full width in frame to decode.
// Exported as the default so a viewfinder overlay can line up a visible
// frame exactly with the region Quagga actually restricts decoding to, even
// when a caller overrides only part of it via `scanArea`.
export const DEFAULT_SCAN_AREA: ScanArea = {
	left: "10%",
	right: "10%",
	top: "37.5%",
	bottom: "37.5%",
};

export type BarcodeCameraStatus =
	| "idle"
	| "starting"
	| "running"
	| "permission-denied"
	| "no-camera"
	| "error";

// Only EAN-13 by default — the format this hook has actually been tuned and
// tested against. Pass `readers` to add or replace formats Quagga supports
// (code_128_reader, upc_reader, ...); this is forwarded to Quagga as-is, so
// any reader it accepts works here too.
export const DEFAULT_READERS: (QuaggaJSReaderConfig | QuaggaJSCodeReader)[] = [
	"ean_reader",
];

export type UseBarcodeCameraOptions = {
	enabled: boolean;
	onScan: (code: string) => void;
	// Merged over DEFAULT_SCAN_AREA — pass only the sides you want to change.
	scanArea?: Partial<ScanArea>;
	// Replaces DEFAULT_READERS entirely (not merged) — include "ean_reader"
	// yourself if you still want it alongside another format.
	readers?: (QuaggaJSReaderConfig | QuaggaJSCodeReader)[];
} & Partial<ScanSessionConfig>;

export type UseBarcodeCameraResult = {
	containerRef: RefObject<HTMLDivElement | null>;
	status: BarcodeCameraStatus;
	// The area actually in effect (defaults merged with any override) — read
	// this back to draw a visible frame that always matches the real decode
	// region instead of hardcoding it a second time.
	scanArea: ScanArea;
};

// getUserMedia reports permission/device failures as a DOMException; Quagga's
// init callback passes `err` straight through undocumented, so this mapping
// needs to be confirmed against a real browser (deny permission, unplug/mock
// camera) rather than trusted blindly.
function classifyError(err: unknown): BarcodeCameraStatus {
	const name = (err as { name?: string } | null)?.name;
	if (name === "NotAllowedError" || name === "PermissionDeniedError") {
		return "permission-denied";
	}
	if (name === "NotFoundError" || name === "DevicesNotFoundError") {
		return "no-camera";
	}
	return "error";
}

// Wraps Quagga2's imperative init/onDetected/onProcessed API. The dedupe rule
// itself (scan-session.ts) stays pure: onDetected feeds it a detection,
// onProcessed's absence of a code feeds it a miss — the session only treats
// the item as gone once that absence is sustained, tolerating Quagga's
// frame-to-frame decode noise.
export function useBarcodeCamera({
	enabled,
	onScan,
	scanArea,
	readers = DEFAULT_READERS,
	dedupeWindowMs,
	missingGraceMs,
	codeChangeConfirmMs,
}: UseBarcodeCameraOptions): UseBarcodeCameraResult {
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<BarcodeCameraStatus>("idle");
	const onScanRef = useRef(onScan);
	onScanRef.current = onScan;

	const effectiveArea: ScanArea = { ...DEFAULT_SCAN_AREA, ...scanArea };
	const { left, right, top, bottom } = effectiveArea;
	// Only the content matters for deciding whether to restart the camera —
	// a caller passing a new-but-equal array literal each render (very
	// common) must not retrigger Quagga.init.
	// readersKey stands in for readers below: compares array content, not
	// identity, so a new-but-equal array literal passed in on every render
	// doesn't restart the camera.
	const readersKey = JSON.stringify(readers);

	// biome-ignore lint/correctness/useExhaustiveDependencies: readersKey replaces readers in the deps list below (see comment above)
	useEffect(() => {
		if (!enabled || !containerRef.current) {
			setStatus("idle");
			return;
		}

		let session: ScanSessionState = createScanSession({
			dedupeWindowMs,
			missingGraceMs,
			codeChangeConfirmMs,
		});
		let cancelled = false;
		setStatus("starting");

		function handleDetected(data: QuaggaJSResultObject) {
			// Despite the type saying codeResult is always present, Quagga
			// passes it as a bare null at runtime when nothing is decoded.
			const code = data?.codeResult?.code;
			if (!code) return;
			const result = registerDetection(session, code, Date.now());
			session = result.session;
			if (result.accept) onScanRef.current(code);
		}

		function handleProcessed(data: QuaggaJSResultObject) {
			if (!data?.codeResult?.code) {
				session = registerMiss(session, Date.now());
			}
		}

		Quagga.init(
			{
				inputStream: {
					type: "LiveStream",
					target: containerRef.current,
					constraints: { facingMode: "environment" },
					// Restricts what Quagga will actually decode — several barcodes
					// visible at once (e.g. a sheet of labels) must not all trigger a
					// scan, only one centered in this band. Quagga can draw this area
					// as a border itself, but only when `locate: false`, which trades
					// away the locating step this hook relies on for robust decoding;
					// draw a visible frame separately as a plain CSS overlay instead.
					area: { left, right, top, bottom },
				},
				decoder: { readers },
			},
			(err) => {
				if (cancelled) {
					// The effect was torn down (React Strict Mode's dev-only
					// mount→cleanup→remount, or a real unmount) before this async
					// callback arrived. Registering handlers now would leave a
					// second, orphaned onDetected/onProcessed pair alive
					// alongside the current run's — every real scan would then
					// fire onScan twice. Just release whatever got started.
					if (!err) Quagga.stop();
					return;
				}
				if (err) {
					setStatus(classifyError(err));
					return;
				}
				Quagga.onDetected(handleDetected);
				Quagga.onProcessed(handleProcessed);
				Quagga.start();
				setStatus("running");
			},
		);

		return () => {
			cancelled = true;
			Quagga.offDetected(handleDetected);
			Quagga.offProcessed(handleProcessed);
			Quagga.stop();
		};
	}, [
		enabled,
		left,
		right,
		top,
		bottom,
		readersKey,
		dedupeWindowMs,
		missingGraceMs,
		codeChangeConfirmMs,
	]);

	return { containerRef, status, scanArea: effectiveArea };
}
