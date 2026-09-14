export type ScanSessionConfig = {
	// A safety-net ceiling, not the routine dedupe path — a barcode propped
	// up and never removed from view must not re-add every couple of
	// seconds. Real dedupe for a still-in-frame code comes from registerMiss
	// (a sustained absence); this only guards against the miss side getting
	// stuck (e.g. the stream freezing without ever reporting a missed
	// frame).
	dedupeWindowMs: number;
	// A decoder's read is noisy even while a barcode is held perfectly
	// still (autofocus hunting, motion blur), so a single missed frame does
	// not mean the item left the camera's view — only a sustained absence
	// does. Too short a grace here lets real-device noise (e.g. screen
	// glare/moiré) clear the session mid-hold, producing repeated duplicate
	// adds on an untouched barcode.
	missingGraceMs: number;
	// A misread (garbage digits that still pass EAN-13's checksum) is
	// almost always a single-frame fluke that never repeats itself on the
	// very next frame — unlike a genuine swap to a different product, which
	// keeps reading the same new code as the cashier holds it in view.
	// Without this, a single misread instantly stole `lastCode`, so the
	// real barcode looked "new" again the moment it was read correctly
	// right after — a double-scan while holding one item motionless in
	// frame.
	codeChangeConfirmMs: number;
};

const DEFAULT_CONFIG: ScanSessionConfig = {
	dedupeWindowMs: 8000,
	missingGraceMs: 700,
	codeChangeConfirmMs: 150,
};

export type ScanSessionState = {
	lastCode: string | null;
	lastAcceptedAt: number;
	missingSince: number | null;
	// A different code seen while lastCode is still tracked, awaiting
	// confirmation before it's trusted enough to replace lastCode.
	pendingCode: string | null;
	pendingSince: number | null;
	config: ScanSessionConfig;
};

export type RegisterDetectionResult = {
	accept: boolean;
	session: ScanSessionState;
};

function freshAccept(
	code: string,
	now: number,
	config: ScanSessionConfig,
): ScanSessionState {
	return {
		lastCode: code,
		lastAcceptedAt: now,
		missingSince: null,
		pendingCode: null,
		pendingSince: null,
		config,
	};
}

export function createScanSession(
	config: Partial<ScanSessionConfig> = {},
): ScanSessionState {
	return {
		lastCode: null,
		lastAcceptedAt: 0,
		missingSince: null,
		pendingCode: null,
		pendingSince: null,
		config: {
			dedupeWindowMs: config.dedupeWindowMs ?? DEFAULT_CONFIG.dedupeWindowMs,
			missingGraceMs: config.missingGraceMs ?? DEFAULT_CONFIG.missingGraceMs,
			codeChangeConfirmMs:
				config.codeChangeConfirmMs ?? DEFAULT_CONFIG.codeChangeConfirmMs,
		},
	};
}

// A held-in-frame code only counts once per DEDUPE_WINDOW_MS. A different
// code only replaces it once seen consistently for CODE_CHANGE_CONFIRM_MS —
// filtering out single-frame misreads — except when nothing is currently
// tracked (session start, or after registerMiss's sustained absence), where
// any code is accepted right away so "scan, leave, scan" stays instant.
export function registerDetection(
	session: ScanSessionState,
	code: string,
	now: number,
): RegisterDetectionResult {
	const { config } = session;

	if (session.lastCode === code) {
		if (now - session.lastAcceptedAt < config.dedupeWindowMs) {
			return {
				accept: false,
				session: {
					...session,
					missingSince: null,
					pendingCode: null,
					pendingSince: null,
				},
			};
		}
		return { accept: true, session: freshAccept(code, now, config) };
	}

	if (session.lastCode === null) {
		return { accept: true, session: freshAccept(code, now, config) };
	}

	if (session.pendingCode === code) {
		if (now - (session.pendingSince ?? now) >= config.codeChangeConfirmMs) {
			return { accept: true, session: freshAccept(code, now, config) };
		}
		return { accept: false, session };
	}

	return {
		accept: false,
		session: { ...session, pendingCode: code, pendingSince: now },
	};
}

// Called on every decoder frame that reads no barcode at all. Only clears
// the session once the code has been missing continuously for
// MISSING_GRACE_MS — e.g. three identical jars scanned in a row, where the
// code is truly absent while the cashier swaps items — not on a single noisy
// frame while the same jar is still held in view.
export function registerMiss(
	session: ScanSessionState,
	now: number,
): ScanSessionState {
	if (session.lastCode === null) {
		return session;
	}

	const missingSince = session.missingSince ?? now;
	if (now - missingSince >= session.config.missingGraceMs) {
		return {
			lastCode: null,
			lastAcceptedAt: session.lastAcceptedAt,
			missingSince: null,
			pendingCode: null,
			pendingSince: null,
			config: session.config,
		};
	}

	return { ...session, missingSince };
}
