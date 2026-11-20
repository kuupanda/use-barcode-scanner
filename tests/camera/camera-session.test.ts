import { describe, expect, it } from "vitest";
import {
	createCameraSession,
	scansBucket,
	startupBucket,
} from "../../src/camera/camera-session";

function clock(start = 0) {
	let time = start;
	return {
		now: () => time,
		advance(ms: number) {
			time += ms;
		},
	};
}

describe("createCameraSession", () => {
	it("summarizes a session that started, scanned twice and closed", () => {
		const c = clock(1000);
		const session = createCameraSession(c.now);
		session.statusChanged("starting");
		c.advance(800);
		session.statusChanged("running");
		c.advance(1500);
		session.scanned();
		c.advance(500);
		session.scanned();
		c.advance(2000);

		expect(session.end()).toEqual({
			finalStatus: "running",
			startupMs: 800,
			firstScanMs: 1500,
			scans: 2,
			durationMs: 4800,
		});
	});

	it("reports a camera that never started", () => {
		const c = clock();
		const session = createCameraSession(c.now);
		session.statusChanged("starting");
		c.advance(300);
		session.statusChanged("permission-denied");
		c.advance(2000);

		expect(session.end()).toEqual({
			finalStatus: "permission-denied",
			startupMs: null,
			firstScanMs: null,
			scans: 0,
			durationMs: 2300,
		});
	});

	it("keeps the first running moment when the status flips again", () => {
		const c = clock();
		const session = createCameraSession(c.now);
		c.advance(500);
		session.statusChanged("running");
		c.advance(500);
		session.statusChanged("error");

		expect(session.end()).toMatchObject({
			finalStatus: "error",
			startupMs: 500,
		});
	});

	it("measures the first scan from the moment the camera was running", () => {
		const c = clock();
		const session = createCameraSession(c.now);
		c.advance(900);
		session.statusChanged("running");
		c.advance(100);
		session.scanned();

		expect(session.end().firstScanMs).toBe(100);
	});

	it("is starting until told otherwise", () => {
		expect(createCameraSession(() => 0).end().finalStatus).toBe("starting");
	});
});

describe("startupBucket", () => {
	it.each([
		[null, "never"],
		[0, "under_1s"],
		[999, "under_1s"],
		[1000, "1_to_3s"],
		[2999, "1_to_3s"],
		[3000, "over_3s"],
	])("buckets %s ms as %s", (ms, bucket) => {
		expect(startupBucket(ms)).toBe(bucket);
	});
});

describe("scansBucket", () => {
	it.each([
		[0, "0"],
		[1, "1"],
		[2, "2_to_5"],
		[5, "2_to_5"],
		[6, "6_plus"],
	])("buckets %s scans as %s", (n, bucket) => {
		expect(scansBucket(n)).toBe(bucket);
	});
});
