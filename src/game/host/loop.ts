/** DOS / Futrega tick. Reachable with `-` from the default. */
export const ORIGINAL_TICK_MS = 1000 / 13
/** Jenner steps `ftime` by 10 ms; `-` and `=` do the same to the period. */
export const SPEED_STEP_MS = 10
/** 16 Hz, then two `=` clicks. */
export const DEFAULT_TICK_MS = 1000 / 16 - SPEED_STEP_MS * 2
export const MIN_TICK_MS = 20
export const MAX_TICK_MS = 200
/** After a stall, run at most this many ticks and drop the rest instead of fast-forwarding. */
export const MAX_CATCH_UP = 4

export function adjustTickMs(ms: number, slower: boolean): number {
	const next = slower ? ms + SPEED_STEP_MS : ms - SPEED_STEP_MS
	return Math.min(MAX_TICK_MS, Math.max(MIN_TICK_MS, next))
}

export interface Loop {
	stop(): void
	/** Run the next tick on this animation frame instead of waiting out the current period. */
	poke(): void
	faster(): void
	slower(): void
	tickMs(): number
}

/**
 * rAF-driven fixed step. `present` runs once per animation frame after the tick batch; the
 * presenter decides whether anything changed. The accumulator resets whenever the tab hides
 * or shows, so returning to the tab never replays the time spent away.
 */
export function startLoop(tick: () => void, present: () => void, onError: (err: unknown) => void, doc: Document = document): Loop {
	let tickMs = DEFAULT_TICK_MS
	let acc = 0
	let last = performance.now()
	let raf = 0
	let running = true
	let poked = false

	const frame = (t: number) => {
		if (!running) return
		const dt = t - last
		last = t
		if (poked) {
			poked = false
			acc = tickMs
		} else if (dt > 0) acc = Math.min(acc + dt, tickMs * MAX_CATCH_UP)
		try {
			while (acc >= tickMs) {
				acc -= tickMs
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
		poke() {
			poked = true
		},
		faster() {
			tickMs = adjustTickMs(tickMs, false)
			if (acc > tickMs) acc = tickMs
		},
		slower() {
			tickMs = adjustTickMs(tickMs, true)
		},
		tickMs() {
			return tickMs
		},
	}
}
