// Headless check of the real engine: no DOM, no WebGL, no audio. Drives it with intents the
// way the keyboard would, asserts the 1983 flow, and writes BMP snapshots of the framebuffer.
//
//   node scripts/verify-engine.mjs [outDir]
//
// Needs Node with TypeScript type stripping on by default (>= 22.18 or >= 23.6).

import { mkdirSync, writeFileSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The sources use Vite-style extensionless relative imports; resolve them to .ts for Node.
register(
	'data:text/javascript,' +
		encodeURIComponent(`
export async function resolve(specifier, context, next) {
	try {
		return await next(specifier, context)
	} catch (err) {
		if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context)
		throw err
	}
}`),
)

const { Engine } = await import('../src/game/engine/engine.ts')
const { localHiScoreStore, HISCORE_KEY } = await import('../src/game/host/hiscore-store.ts')
const { parseKeyDown, parseKeyUp } = await import('../src/game/host/keyboard.ts')
const { PcSpeaker } = await import('../src/game/audio/pc-speaker.ts')
const { CGA_RGB } = await import('../src/game/pc/palette.ts')

const outDir = process.argv[2] ?? join(tmpdir(), 'digger-verify')
mkdirSync(outDir, { recursive: true })

class MemoryStorage {
	#m = new Map()
	get length() {
		return this.#m.size
	}
	key(i) {
		return [...this.#m.keys()][i] ?? null
	}
	getItem(k) {
		return this.#m.has(k) ? this.#m.get(k) : null
	}
	setItem(k, v) {
		this.#m.set(k, String(v))
	}
	removeItem(k) {
		this.#m.delete(k)
	}
	clear() {
		this.#m.clear()
	}
}

let failures = 0
function check(name, ok, detail = '') {
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`)
	if (!ok) failures++
}

const storage = new MemoryStorage()
const engine = new Engine({ seed: 12345, hiscores: localHiScoreStore(storage) })
// TypeScript-private, reachable at runtime for inspection only.
const w = engine.w
const stage = () => engine.session.round?.stage
const cues = []

function tick(intents = []) {
	engine.tick(intents)
	cues.push(...engine.takeSoundCues())
}
function ticks(n) {
	for (let i = 0; i < n; i++) tick()
}
function runUntil(pred, max) {
	for (let i = 0; i < max; i++) {
		if (pred()) return i
		tick()
	}
	return pred() ? max : -1
}
/** Non-zero VRAM bytes inside a pixel rectangle. */
function inkIn(x, y, width, height) {
	const { vram } = engine.frame()
	let n = 0
	for (let yy = y; yy < y + height; yy++) for (let bx = x >> 2; bx < (x + width) >> 2; bx++) if (vram[yy * 80 + bx]) n++
	return n
}
function saveBmp(name) {
	const { vram, intensity } = engine.frame()
	const pal = CGA_RGB[intensity]
	const W = 320
	const H = 200
	const row = W * 3
	const buf = Buffer.alloc(54 + row * H)
	buf.write('BM', 0)
	buf.writeUInt32LE(buf.length, 2)
	buf.writeUInt32LE(54, 10)
	buf.writeUInt32LE(40, 14)
	buf.writeInt32LE(W, 18)
	buf.writeInt32LE(H, 22)
	buf.writeUInt16LE(1, 26)
	buf.writeUInt16LE(24, 28)
	buf.writeUInt32LE(row * H, 34)
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const c = (vram[y * 80 + (x >> 2)] >> (6 - 2 * (x & 3))) & 3
			const o = 54 + (H - 1 - y) * row + x * 3
			buf[o] = pal[c][2]
			buf[o + 1] = pal[c][1]
			buf[o + 2] = pal[c][0]
		}
	writeFileSync(join(outDir, `${name}.bmp`), buf)
}
function killWhileLive() {
	if (engine.phase === 'playing' && stage() === 'live' && w.digger.digonscr) w.digger.killdigger(3, 0)
}

// ── title ───────────────────────────────────────────────────────────────────
check('boots to the title', engine.phase === 'title')
check('title bitmap drawn', inkIn(0, 14, 320, 186) > 2000, `${inkIn(0, 14, 320, 186)} bytes`)
check('"D I G G E R" on the top line', inkIn(100, 0, 132, 12) > 0)
saveBmp('01-title')
ticks(240)
check('attract animation runs', engine.phase === 'title' && inkIn(184, 63, 16, 15) > 0)
saveBmp('02-title-attract')
tick([{ type: 'TogglePlayers' }])
check('Esc switches to TWO PLAYERS', w.main.nplayers === 2)
tick([{ type: 'TogglePlayers' }])
check('Esc switches back to ONE PLAYER', w.main.nplayers === 1)

// ── one player: start, dig, fire, pause ─────────────────────────────────────
tick([{ type: 'Start' }])
check('any key starts', engine.phase === 'playing' && stage() === 'live')
check('level 1 with 3 lives', w.main.gamedat[0].level === 1 && w.main.gamedat[0].lives === 3)
check('Popcorn starts', cues.some((c) => c.cue === 'music' && c.tune === 1))
saveBmp('03-level1')

const x0 = w.digger.diggerx
tick([{ type: 'Move', dir: 4, held: true }])
ticks(10)
tick([{ type: 'Move', dir: 4, held: false }])
check('arrow moves the digger', w.digger.diggerx < x0, `${x0} -> ${w.digger.diggerx}`)

cues.length = 0
tick([{ type: 'Fire', held: true }])
tick([{ type: 'Fire', held: false }])
ticks(3)
check('Space fires', cues.some((c) => c.cue === 'fire'))

tick([{ type: 'Pause' }, { type: 'Type', glyph: 'P' }])
check('P pauses', engine.phase === 'paused')
check('"PRESS ANY KEY" is in the framebuffer', inkIn(80, 0, 156, 12) > 0)
saveBmp('04-paused')
const frozen = engine.frame().version
ticks(10)
check('nothing moves while paused', engine.frame().version === frozen)
tick([{ type: 'Start' }])
check('any key resumes', engine.phase === 'playing' && stage() === 'live')

const lives = w.main.gamedat[0].lives
cues.length = 0
w.scores.addscore(20000 - w.scores.score1)
cues.push(...engine.takeSoundCues())
check('extra life at 20000', w.main.gamedat[0].lives === Math.min(5, lives + 1) && cues.some((c) => c.cue === 'oneUp'))

// ── all eight maps: clear by emeralds, levplan 12345678 then 678, 5... ───────
const plans = [w.main.levplan()]
let cleared = true
cues.length = 0
for (let i = 0; i < 11 && cleared; i++) {
	const level = w.main.gamedat[0].level
	w.digger.emfield.fill(0)
	cleared = runUntil(() => w.main.gamedat[0].level > level && stage() === 'live', 400) >= 0
	plans.push(w.main.levplan())
	if (plans.length <= 8) saveBmp(`05-map-${plans.at(-1)}`)
}
check('level advances after the last emerald', cleared)
check('level-done jingle cue', cues.some((c) => c.cue === 'levelDone'))
check('maps cycle 1..8, then 6 7 8 5', plans.join('') === '123456786785', plans.join(''))

// ── deaths, game over, initials ─────────────────────────────────────────────
const over = runUntil(() => {
	killWhileLive()
	return engine.phase === 'highscore-initials' || engine.phase === 'gameover'
}, 3000)
check('losing every life ends the game', over >= 0)
check('a non-zero score asks for initials', engine.phase === 'highscore-initials')
saveBmp('06-initials')
for (const g of ['A', 'B']) tick([{ type: 'Type', glyph: g }])
tick([{ type: 'Erase' }])
for (const g of ['X', 'C']) tick([{ type: 'Type', glyph: g }])
runUntil(() => engine.phase === 'title', 60)
check('back to the title after initials', engine.phase === 'title')
const saved = JSON.parse(storage.getItem(HISCORE_KEY) ?? 'null')
check(
	'high score saved as digger.hiscores.v1 with initials',
	saved?.version === 1 && saved.rows?.[0]?.initials === 'AXC' && saved.rows[0].score > 0,
	JSON.stringify(saved?.rows?.[0]),
)
saveBmp('07-title-with-score')

// ── two players: announce, turn passes on death ─────────────────────────────
tick([{ type: 'TogglePlayers' }])
tick([{ type: 'Start' }])
check('two players: PLAYER 1 is announced', stage() === 'announce')
saveBmp('08-player1-announce')
runUntil(() => stage() === 'live', 60)
check('announce hands over to play', stage() === 'live')
killWhileLive()
runUntil(() => w.main.curplayer === 1 && stage() === 'live', 400)
check('after a death the turn passes to player 2', w.main.curplayer === 1)

// ── game over without a qualifying score ────────────────────────────────────
const end = runUntil(() => {
	killWhileLive()
	return engine.phase === 'gameover' || engine.phase === 'highscore-initials'
}, 4000)
check('two-player game ends', end >= 0, engine.phase)
if (engine.phase === 'gameover') {
	check('"GAME OVER" on the top line', inkIn(104, 0, 108, 12) > 0)
	saveBmp('09-game-over')
}

// ── WASD and the original 72.8 Hz level jingle ──────────────────────────────
const wDown = parseKeyDown({ code: 'KeyW', key: 'w', repeat: false, ctrlKey: false, metaKey: false, altKey: false })
check(
	'W moves up',
	wDown.some((i) => i.type === 'Move' && i.dir === 2 && i.held) && wDown.some((i) => i.type === 'Type' && i.glyph === 'W'),
)
check(
	'A S D match left down right',
	parseKeyDown({ code: 'KeyA', key: 'a', repeat: false, ctrlKey: false, metaKey: false, altKey: false }).some(
		(i) => i.type === 'Move' && i.dir === 4 && i.held,
	) &&
		parseKeyDown({ code: 'KeyS', key: 's', repeat: false, ctrlKey: false, metaKey: false, altKey: false }).some(
			(i) => i.type === 'Move' && i.dir === 6 && i.held,
		) &&
		parseKeyDown({ code: 'KeyD', key: 'd', repeat: false, ctrlKey: false, metaKey: false, altKey: false }).some(
			(i) => i.type === 'Move' && i.dir === 0 && i.held,
		),
)
check(
	'W keyup releases up',
	parseKeyUp({ code: 'KeyW' }).some((i) => i.type === 'Move' && i.dir === 2 && !i.held),
)

const speaker = new PcSpeaker(48000)
speaker.apply({ cue: 'levelDone' })
const halfSec = new Float32Array(24000)
speaker.fill(halfSec)
let energy = 0
for (let i = 0; i < halfSec.length; i++) energy += halfSec[i] * halfSec[i]
check('level jingle still playing at 0.5s', energy > 1, `energy=${energy.toFixed(3)}`)

console.log(`\nsnapshots in ${outDir}`)
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
