export type CameraStatus =
	| "idle"
	| "starting"
	| "running"
	| "permission-denied"
	| "no-camera"
	| "error";

export interface CameraSessionSummary {
	finalStatus: CameraStatus;
	/** Open to first `running`; null when the camera never started. */
	startupMs: number | null;
	/** First `running` to first scan; null when nothing was scanned. */
	firstScanMs: number | null;
	scans: number;
	durationMs: number;
}

export interface CameraSession {
	statusChanged(status: CameraStatus): void;
	scanned(): void;
	end(): CameraSessionSummary;
}

export function createCameraSession(now: () => number): CameraSession {
	const openedAt = now();
	let status: CameraStatus = "starting";
	let runningAt: number | null = null;
	let firstScanAt: number | null = null;
	let scans = 0;

	return {
		statusChanged(next) {
			status = next;
			if (next === "running" && runningAt === null) runningAt = now();
		},
		scanned() {
			scans += 1;
			if (firstScanAt === null) firstScanAt = now();
		},
		end() {
			return {
				finalStatus: status,
				startupMs: runningAt === null ? null : runningAt - openedAt,
				firstScanMs:
					runningAt === null || firstScanAt === null
						? null
						: firstScanAt - runningAt,
				scans,
				durationMs: now() - openedAt,
			};
		},
	};
}

export type StartupBucket = "never" | "under_1s" | "1_to_3s" | "over_3s";

export function startupBucket(startupMs: number | null): StartupBucket {
	if (startupMs === null) return "never";
	if (startupMs < 1000) return "under_1s";
	if (startupMs < 3000) return "1_to_3s";
	return "over_3s";
}

export type ScansBucket = "0" | "1" | "2_to_5" | "6_plus";

export function scansBucket(scans: number): ScansBucket {
	if (scans === 0) return "0";
	if (scans === 1) return "1";
	if (scans <= 5) return "2_to_5";
	return "6_plus";
}
