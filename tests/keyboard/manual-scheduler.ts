// Deterministic stand-in for setTimeout: time only moves when the test says so.
export function createManualScheduler() {
	let time = 0;
	let sequence = 0;
	const tasks = new Map<number, { at: number; run: () => void }>();

	function runDueTasks(until: number) {
		for (;;) {
			const due = [...tasks.entries()]
				.filter(([, task]) => task.at <= until)
				.sort(([idA, a], [idB, b]) => a.at - b.at || idA - idB)[0];
			if (!due) return;
			const [id, task] = due;
			tasks.delete(id);
			time = Math.max(time, task.at);
			task.run();
		}
	}

	return {
		now: () => time,
		schedule(run: () => void, delayMs: number): number {
			sequence += 1;
			tasks.set(sequence, { at: time + delayMs, run });
			return sequence;
		},
		cancel(handle: unknown) {
			tasks.delete(handle as number);
		},
		advanceTo(target: number) {
			runDueTasks(target);
			time = Math.max(time, target);
		},
		advanceBy(delta: number) {
			this.advanceTo(time + delta);
		},
		pendingCount: () => tasks.size,
	};
}
