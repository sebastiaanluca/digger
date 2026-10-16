/** The JS port's tick: ~13 Hz. Every original wait is one tick. */
export const TICK_MS = 1000 / 13
/** After a stall, run at most this many ticks and drop the rest instead of fast-forwarding. */
export const MAX_CATCH_UP = 4

export interface Loop {
	stop(): void
}

/**
 * rAF-driven fixed step. `present` runs once per animation frame after the tick batch; the
 * presenter decides whether anything changed. The accumulator resets whenever the tab hides
 * or shows, so returning to the tab never replays the time spent away.
 */
export function startLoop(tick: () => void, present: () => void, onError: (err: unknown) => void, doc: Document = document): Loop {
	let acc = 0
	let last = performance.now()
	let raf = 0
	let running = true

	const frame = (t: number) => {
		if (!running) return
		const dt = t - last
		last = t
		if (dt > 0) acc = Math.min(acc + dt, TICK_MS * MAX_CATCH_UP)
		try {
			while (acc >= TICK_MS) {
				acc -= TICK_MS
				tick()
			}
			present()
		} catch (err) {
			running = false
			onError(err)
			return
		}
		raf = requestAnimationFrame(frame)
	}

	const onVisibility = () => {
		acc = 0
		last = performance.now()
	}

	doc.addEventListener('visibilitychange', onVisibility)
	raf = requestAnimationFrame(frame)

	return {
		stop() {
			running = false
			cancelAnimationFrame(raf)
			doc.removeEventListener('visibilitychange', onVisibility)
		},
	}
}
