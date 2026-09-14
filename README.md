# use-barcode-scanner

React hooks for scanning barcodes from two common inputs:

- **`useBarcodeScanner`** — a HID keyboard-wedge scanner (USB/Bluetooth). These scanners type the code as fast keystrokes ending in Enter; this hook tells that apart from a human typing.
- **`useBarcodeCamera`** — a phone/tablet camera, decoded with [Quagga2](https://github.com/ericblade/quagga2), restricted to a centered region of interest so multiple visible barcodes don't all trigger a scan.

Both report scans through the same `onScan(code: string)` callback, so the rest of your app (looking up a product, adding a cart line, whatever) doesn't need to know which input produced the code.

Camera scanning is built on a small, framework-agnostic dedupe engine (`createScanSession` / `registerDetection` / `registerMiss`) that solves the actual hard problem: telling a genuine repeat scan (the same product scanned three times in a row) apart from decoder noise (a barcode misread for one frame, or briefly unreadable due to autofocus/motion blur) — without a fixed cooldown that would either block real repeats or let noise through. It's exported directly if you want to drive a decoder of your own.

## Install

```bash
npm install use-barcode-scanner
```

`react` is a required peer dependency. `@ericblade/quagga2` is an optional peer dependency — only install it if you use `useBarcodeCamera`:

```bash
npm install @ericblade/quagga2
```

## `useBarcodeScanner` — keyboard-wedge scanner

```tsx
import { useBarcodeScanner } from "use-barcode-scanner";

function Register() {
	useBarcodeScanner({
		enabled: true,
		onScan: (code) => {
			// look up `code` in your catalog, add it to the cart, etc.
		},
	});

	return <div>...</div>;
}
```

Listens on `window`, so it works regardless of what element has focus. Digits are read from `event.code` (`Digit0`–`Digit9`, `Numpad0`–`Numpad9`), not `event.key` — on a non-US layout (e.g. French AZERTY) the OS translates `event.key` into symbols, but `event.code` still names the physical key.

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | — | Set to `false` to stop listening (e.g. while a dialog is open). |
| `onScan` | — | Called with the scanned code once a fast-enough digit burst ends in Enter. |
| `maxIntervalMs` | `100` | Max time between keystrokes to still count as the same scan. |
| `minLength` | `5` | Minimum digit count for Enter to be treated as ending a scan. |

## `useBarcodeCamera` — camera scanner

```tsx
import { useBarcodeCamera } from "use-barcode-scanner";

function Viewfinder() {
	const { containerRef, status, scanArea } = useBarcodeCamera({
		enabled: true,
		onScan: (code) => {
			// same as above
		},
	});

	return <div ref={containerRef} style={{ position: "relative" }} />;
}
```

`status` is one of `"idle" | "starting" | "running" | "permission-denied" | "no-camera" | "error"` — render your own messaging around it.

Decoding is restricted to a centered band (`DEFAULT_SCAN_AREA`, also exported) covering 80% of the width and 25% of the height — a band, not a square, because an EAN-13 needs its full width in frame to decode. Draw your own visible frame over `containerRef` at those same coordinates if you want to show it to the user (color, border, whatever — this package draws no UI); Quagga's own border-draw isn't used here since it requires `locate: false`, which trades away the locating step this hook relies on for robust decoding.

Every knob that affects behavior is configurable:

```tsx
useBarcodeCamera({
	enabled: true,
	onScan: (code) => { /* ... */ },

	// Merged over DEFAULT_SCAN_AREA — pass only the sides you want to change.
	scanArea: { top: "30%", bottom: "30%" }, // a taller band, e.g. for Code 128

	// scan-session tuning (see below) — all optional, shown here with their defaults.
	dedupeWindowMs: 8000,
	missingGraceMs: 700,
	codeChangeConfirmMs: 150,
});
```

`scanArea` in the returned value is always the *effective* area (defaults merged with your override) — read it back instead of hardcoding your overlay's coordinates a second time, so they can never drift apart from what's actually being decoded.

## Dedupe engine

```ts
import { createScanSession, registerDetection, registerMiss } from "use-barcode-scanner";

let session = createScanSession({
	dedupeWindowMs: 8000, // optional, shown with its default
	missingGraceMs: 700, // optional, shown with its default
	codeChangeConfirmMs: 150, // optional, shown with its default
});

// on every decoded frame:
const result = registerDetection(session, code, Date.now());
session = result.session;
if (result.accept) {
	/* handle the scan */
}

// on every frame where nothing decoded:
session = registerMiss(session, Date.now());
```

`useBarcodeCamera` already wires this up for you — reach for it directly only if you're driving a different decoder.

| Option | Default | Meaning |
| --- | --- | --- |
| `dedupeWindowMs` | `8000` | Safety-net ceiling, not the routine dedupe path — a barcode never removed from view re-accepts after this long regardless, in case `registerMiss` never fires. Real dedupe of a still-in-frame code is `missingGraceMs`. |
| `missingGraceMs` | `700` | How long a code must be *continuously* missing before the same code counts as a new scan again. Raise it if your decoder is noisier (more single-frame misses on a motionless barcode); lower it to detect a genuine item swap faster. |
| `codeChangeConfirmMs` | `150` | How long a *different* code must persist before it replaces the one currently tracked. Filters out single-frame misreads (garbage that still passes the barcode format's checksum) so they can't interrupt dedupe of the real code. |

## License

MIT
