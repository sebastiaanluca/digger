import { Engine } from './engine/engine'
import { localHiScoreStore } from './host/hiscore-store'
import { attachKeyboard } from './host/keyboard'
import { startLoop } from './host/loop'
import { createPresenter, type Presenter } from './host/presenter'
import { createSpeaker } from './host/speaker'

export interface GameHandle {
	/** Idempotent. Stops the loop, detaches keys, closes audio, releases GL. */
	destroy(): void
}

// Remembered on the element, not in module state, so it survives HMR re-evaluation.
const INSTANCE = Symbol.for('digger.instance')
type CanvasWithGame = HTMLCanvasElement & { [INSTANCE]?: GameHandle }

function safeLocalStorage(): Storage | null {
	try {
		return window.localStorage
	} catch {
		return null
	}
}

function randomSeed(): number {
	return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff
}

function showFatal(canvas: HTMLCanvasElement, err: unknown): void {
	const id = 'digger-error'
	document.getElementById(id)?.remove()
	const p = document.createElement('p')
	p.id = id
	p.setAttribute('role', 'alert')
	p.className = 'absolute inset-x-4 top-1/2 -translate-y-1/2 text-center font-mono text-base text-red-400'
	p.textContent = err instanceof Error ? err.message : String(err)
	;(canvas.parentElement ?? document.body).append(p)
}

/**
 * Starts Digger on `#digger` (or the given canvas). A second boot on the same canvas destroys
 * the first. The page leaving (pagehide) destroys the game too.
 */
export function boot(canvas: HTMLCanvasElement | null = document.querySelector<HTMLCanvasElement>('#digger')): GameHandle {
	if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Digger canvas #digger is missing')
	const host = canvas as CanvasWithGame
	host[INSTANCE]?.destroy()

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
	let presenter: Presenter
	try {
		presenter = createPresenter(canvas, { reducedMotion: () => reducedMotion.matches })
	} catch (err) {
		showFatal(canvas, err)
		throw err
	}
	document.getElementById('digger-error')?.remove()

	const engine = new Engine({ seed: randomSeed(), hiscores: localHiScoreStore(safeLocalStorage()) })
	const speaker = createSpeaker()
	const keyboard = attachKeyboard(window, () => speaker.unlock())

	let destroyed = false
	const handle: GameHandle = {
		destroy() {
			if (destroyed) return
			destroyed = true
			loop.stop()
			keyboard.dispose()
			speaker.dispose()
			presenter.dispose()
			window.removeEventListener('pagehide', onPageHide)
			document.removeEventListener('visibilitychange', onVisibility)
			if (host[INSTANCE] === handle) delete host[INSTANCE]
		},
	}

	const loop = startLoop(
		() => engine.tick(keyboard.drain()),
		() => {
			presenter.present(engine.frame())
			speaker.play(engine.takeSoundCues())
		},
		(err) => {
			console.error(err)
			showFatal(host, err)
			handle.destroy()
		},
	)

	const onPageHide = () => handle.destroy()
	const onVisibility = () => {
		if (document.hidden) speaker.suspend()
		else speaker.resume()
	}
	window.addEventListener('pagehide', onPageHide)
	document.addEventListener('visibilitychange', onVisibility)

	host[INSTANCE] = handle
	canvas.focus({ preventScroll: true })
	return handle
}
