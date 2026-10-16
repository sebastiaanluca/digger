import { toGlyph, type Dir, type Glyph, type Intent } from '../engine/types'

/*
 *   code                         keydown                      keyup
 *   ArrowRight/Up/Left/Down      Move(dir, held)              Move(dir, released)
 *   Space, F1                    Fire(held)                   Fire(released)
 *   KeyP                         Pause, Type('P')             —
 *   Escape                       TogglePlayers                —
 *   Backspace, Delete            Erase, Start                 —
 *   KeyA–Z, Digit/Numpad 0–9     Start, Type(glyph)           —
 *   any other non-modifier key   Start                        —
 *   Tab, bare modifiers, Ctrl/Meta/Alt chords, F5, F11, F12, e.repeat → nothing, not prevented
 */

type KeyLike = Pick<KeyboardEvent, 'code' | 'key' | 'repeat' | 'ctrlKey' | 'metaKey' | 'altKey'>

const ARROWS: Readonly<Record<string, Dir>> = {
	ArrowRight: 0,
	ArrowUp: 2,
	ArrowLeft: 4,
	ArrowDown: 6,
}

const FIRE_CODES = new Set(['Space', 'F1'])

const IGNORED_CODES = new Set(['Tab', 'F5', 'F11', 'F12'])

const MODIFIER_KEYS = new Set([
	'Shift',
	'Control',
	'Alt',
	'AltGraph',
	'Meta',
	'OS',
	'Super',
	'Hyper',
	'Fn',
	'FnLock',
	'CapsLock',
	'NumLock',
	'ScrollLock',
	'Symbol',
	'SymbolLock',
	'Dead',
	'Unidentified',
])

/** The typed character when it is A–Z/0–9 (any layout), else the physical key. */
function glyphOf(e: KeyLike): Glyph | null {
	const typed = e.key.length === 1 ? toGlyph(e.key) : null
	if (typed) return typed
	const m = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/.exec(e.code)
	return m ? toGlyph(m[1] ?? m[2] ?? m[3] ?? '') : null
}

function isGameKey(code: string): boolean {
	return ARROWS[code] !== undefined || FIRE_CODES.has(code)
}

export function parseKeyDown(e: KeyLike): readonly Intent[] {
	if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return []
	if (IGNORED_CODES.has(e.code) || MODIFIER_KEYS.has(e.key)) return []
	const dir = ARROWS[e.code]
	if (dir !== undefined) return [{ type: 'Move', dir, held: true }]
	if (FIRE_CODES.has(e.code)) return [{ type: 'Fire', held: true }]
	if (e.code === 'Escape') return [{ type: 'TogglePlayers' }]
	if (e.code === 'Backspace' || e.code === 'Delete') return [{ type: 'Erase' }, { type: 'Start' }]
	const glyph = glyphOf(e)
	if (e.code === 'KeyP' || glyph === 'P') return glyph ? [{ type: 'Pause' }, { type: 'Type', glyph }] : [{ type: 'Pause' }]
	if (glyph) return [{ type: 'Start' }, { type: 'Type', glyph }]
	return [{ type: 'Start' }]
}

export function parseKeyUp(e: Pick<KeyboardEvent, 'code'>): readonly Intent[] {
	const dir = ARROWS[e.code]
	if (dir !== undefined) return [{ type: 'Move', dir, held: false }]
	if (FIRE_CODES.has(e.code)) return [{ type: 'Fire', held: false }]
	return []
}

export interface Keyboard {
	/** Returns queued intents in arrival order and empties the queue. */
	drain(): readonly Intent[]
	dispose(): void
}

/**
 * Listens on window: the page is the game, and a click on the letterbox must not drop input.
 * `onGesture` runs on keydowns so the speaker can start audio inside a user gesture.
 * Window blur queues releases for everything held, then Pause, so keys cannot stick.
 */
export function attachKeyboard(target: Window, onGesture: () => void): Keyboard {
	let queue: Intent[] = []
	const held = new Set<string>()

	const onKeyDown = (e: KeyboardEvent) => {
		const intents = parseKeyDown(e)
		if (intents.length === 0) {
			// Auto-repeat of a held game key carries no intent but must not scroll or open help.
			if (e.repeat && isGameKey(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault()
			return
		}
		e.preventDefault()
		if (isGameKey(e.code)) held.add(e.code)
		queue.push(...intents)
		onGesture()
	}

	const onKeyUp = (e: KeyboardEvent) => {
		const intents = parseKeyUp(e)
		if (intents.length === 0) return
		e.preventDefault()
		held.delete(e.code)
		queue.push(...intents)
	}

	const onBlur = () => {
		for (const code of held) queue.push(...parseKeyUp({ code }))
		held.clear()
		queue.push({ type: 'Pause' })
	}

	target.addEventListener('keydown', onKeyDown)
	target.addEventListener('keyup', onKeyUp)
	target.addEventListener('blur', onBlur)

	return {
		drain() {
			const out = queue
			queue = []
			return out
		},
		dispose() {
			target.removeEventListener('keydown', onKeyDown)
			target.removeEventListener('keyup', onKeyUp)
			target.removeEventListener('blur', onBlur)
			queue = []
			held.clear()
		},
	}
}
