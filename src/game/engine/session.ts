/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Main.main()/play(), Main.testpause() and Scores.endofgame()/getinitials() as a state machine
 * stepped once per tick. Every original wait (newframe(), flashywait(), one setInterval period)
 * is exactly one tick, which also brings back the PLAYER n flash, GAME OVER and the initials
 * cursor that Futrega's non-waiting loops finished inside a single task.
 */

import { digsprorder } from './main'
import { isPress, type Glyph, type Intent, type PlayerIndex } from './types'
import type { World } from './world'

export const TITLE_FRAMES = 250
/** 15 passes × colours 1..3 of "PLAYER n". */
export const ANNOUNCE_STEPS = 45
export const SETTLE_TICKS = 20
/** New-level jingle: 11 notes × 21 timer ticks at ~72.8 Hz ≈ 3.17 s. The sim counts ticks, not audio. */
export const LEVEL_DONE_TICKS = 42
/** As in the C remaster: 50 frames of GAME OVER, without the palette strobe. */
export const GAME_OVER_TICKS = 50
export const CURSOR_HALF_TICKS = 40
export const INITIALS_HOLD_TICKS = 20

export interface Title {
	readonly phase: 'title'
	/** Attract animation frame 0..250 (nobbin, hobbin, digger walk in; labels appear). */
	readonly frame: number
}

export type Round =
	| { readonly stage: 'announce'; readonly step: number }
	| { readonly stage: 'live' }
	/** Bags finish falling after death or clear; t counts down from SETTLE_TICKS. */
	| { readonly stage: 'settle'; readonly t: number }
	| { readonly stage: 'cleared'; readonly t: number }

export type LiveRound = Extract<Round, { readonly stage: 'live' }>

export interface Playing<R extends Round = Round> {
	readonly phase: 'playing'
	readonly round: R
}

/** Only a live round can pause, and resuming returns to exactly that round. */
export interface Paused {
	readonly phase: 'paused'
	readonly resume: Playing<LiveRound>
}

export type InitialSlot = Glyph | '.'
export type Initials = readonly [InitialSlot, InitialSlot, InitialSlot]

export type InitialsEntry =
	| {
			readonly kind: 'typing'
			readonly slot: 0 | 1 | 2
			readonly letters: Initials
			readonly cursorOn: boolean
			readonly t: number
	  }
	| { readonly kind: 'committed'; readonly letters: Initials; readonly t: number }

export interface HighscoreInitials {
	readonly phase: 'highscore-initials'
	readonly player: PlayerIndex
	readonly entry: InitialsEntry
}

export interface GameOver {
	readonly phase: 'gameover'
	readonly t: number
}

export type Session = Title | Playing | Paused | HighscoreInitials | GameOver

/** One tick. Controls already hold this tick's intents; `intents` gives the presses for phase logic. */
export function step(s: Session, w: World, intents: readonly Intent[]): Session {
	switch (s.phase) {
		case 'title':
			return titleTick(w, s, intents)
		case 'playing':
			return playingTick(w, s)
		case 'paused':
			return pausedTick(w, s, intents)
		case 'highscore-initials':
			return initialsTick(w, s, intents)
		case 'gameover':
			return gameOverTick(w, s)
	}
}

// ── title ───────────────────────────────────────────────────────────────────

/** soundstop, sprite order, gclear, gtitle, "D I G G E R", player count, high score table. */
export function enterTitle(w: World): Title {
	w.sound.soundstop()
	w.sprites.setsprorder(digsprorder)
	w.drawing.creatembspr()
	w.controls.detectjoy()
	w.cga.gclear()
	w.cga.gtitle()
	w.drawing.outtext('D I G G E R', 100, 0, 3)
	w.main.shownplayers()
	w.scores.showtable()
	return { phase: 'title', frame: 1 }
}

function titleTick(w: World, s: Title, intents: readonly Intent[]): Session {
	for (const i of intents) {
		if (i.type === 'TogglePlayers') {
			w.main.switchnplayers()
			w.main.shownplayers()
		}
	}
	if (intents.some(isPress)) return startGame(w)
	titleFrame(w, s.frame)
	const frame = s.frame + 1
	return { phase: 'title', frame: frame > TITLE_FRAMES ? 0 : frame }
}

/** One frame of the title setInterval body. x is derived from the frame instead of carried. */
export function titleFrame(w: World, frame: number): void {
	const { drawing, sprites } = w
	if (frame == 0) for (let t = 54; t < 174; t += 12) drawing.outtext('            ', 164, t, 0)
	if (frame == 50) sprites.movedrawspr(8, 292, 63)
	if (frame > 50 && frame <= 77) drawing.drawmon(0, true, 4, 292 - 4 * (frame - 50), 63)
	if (frame > 77) drawing.drawmon(0, true, 0, 184, 63)
	if (frame == 83) drawing.outtext('NOBBIN', 216, 64, 2)
	if (frame == 90) {
		sprites.movedrawspr(9, 292, 82)
		drawing.drawmon(1, false, 4, 292, 82)
	}
	if (frame > 90 && frame <= 117) drawing.drawmon(1, false, 4, 292 - 4 * (frame - 90), 82)
	if (frame > 117) drawing.drawmon(1, false, 0, 184, 82)
	if (frame == 123) drawing.outtext('HOBBIN', 216, 83, 2)
	if (frame == 130) {
		sprites.movedrawspr(0, 292, 101)
		drawing.drawdigger(4, 292, 101, true)
	}
	if (frame > 130 && frame <= 157) drawing.drawdigger(4, 292 - 4 * (frame - 130), 101, true)
	if (frame > 157) drawing.drawdigger(0, 184, 101, true)
	if (frame == 163) drawing.outtext('DIGGER', 216, 102, 2)
	if (frame == 178) {
		sprites.movedrawspr(1, 184, 120)
		drawing.drawgold(1, 0, 184, 120)
	}
	if (frame == 183) drawing.outtext('GOLD', 216, 121, 2)
	if (frame == 198) drawing.drawemerald(184, 141)
	if (frame == 203) drawing.outtext('EMERALD', 216, 140, 2)
	if (frame == 218) drawing.drawbonus(184, 158)
	if (frame == 223) drawing.outtext('BONUS', 216, 159, 2)
}

/** Lives 5/5 or 5/0, both players' levels initialised, scores zeroed; announce only in 2P. */
export function startGame(w: World): Playing {
	const m = w.main
	m.gamedat[0].level = 1
	m.gamedat[0].lives = 5
	if (m.nplayers == 2) {
		m.gamedat[1].level = 1
		m.gamedat[1].lives = 5
	} else m.gamedat[1].lives = 0
	w.cga.gclear()
	m.curplayer = 0
	m.initlevel()
	m.curplayer = 1
	m.initlevel()
	w.scores.zeroscores()
	w.digger.bonusvisible = true
	m.flashplayer = m.nplayers == 2
	m.curplayer = 0
	// The key that started the game may have been P or Space; it must not pause or shoot.
	w.controls.takePause()
	w.controls.releaseFire()
	m.gamedat[0].dead = false
	return startRound(w)
}

// ── playing ─────────────────────────────────────────────────────────────────

/** Top half of Main.play(): redraw or initchars, then announce or straight to live. */
export function startRound(w: World): Playing {
	const m = w.main
	w.drawing.initmbspr()
	if (m.levnotdrawn) {
		m.levnotdrawn = false
		m.drawscreen()
		if (m.flashplayer) {
			m.flashplayer = false
			m.pldispbuf = 'PLAYER ' + (m.curplayer == 0 ? '1' : '2')
			m.cleartopline()
			announceStep(w, 0)
			return { phase: 'playing', round: { stage: 'announce', step: 1 } }
		}
	} else m.initchars()
	return beginLive(w)
}

function announceStep(w: World, step: number): void {
	const c = (step % 3) + 1
	w.drawing.outtext(w.main.pldispbuf, 108, 0, c)
	w.scores.writecurscore(c)
}

function beginLive(w: World): Playing<LiveRound> {
	w.drawing.outtext('        ', 108, 0, 3)
	w.scores.initscores()
	w.drawing.drawlives()
	w.sound.music(1)
	w.controls.readdir()
	return { phase: 'playing', round: { stage: 'live' } }
}

function playingTick(w: World, s: Playing): Session {
	const m = w.main
	const g = m.gamedat[m.curplayer]
	const r = s.round
	switch (r.stage) {
		case 'announce':
			if (r.step < ANNOUNCE_STEPS) {
				announceStep(w, r.step)
				return { phase: 'playing', round: { stage: 'announce', step: r.step + 1 } }
			}
			w.scores.drawscores()
			w.scores.addscore(0)
			return beginLive(w)
		case 'live':
			if (!g.dead && !g.levdone) return liveTick(w, { phase: 'playing', round: r })
			w.digger.erasedigger()
			w.sound.musicoff()
			return { phase: 'playing', round: { stage: 'settle', t: SETTLE_TICKS } }
		case 'settle': {
			if (w.bags.getnmovingbags() != 0 || r.t != 0) {
				let t = r.t
				if (t != 0) t--
				m.penalty = 0
				w.bags.dobags()
				w.digger.dodigger()
				w.monsters.domonsters()
				if (m.penalty < 8) t = 0
				return { phase: 'playing', round: { stage: 'settle', t } }
			}
			w.sound.soundstop()
			w.digger.killfire()
			w.digger.erasebonus()
			w.bags.cleanupbags()
			w.drawing.savefield()
			w.monsters.erasemonsters()
			if (g.levdone) {
				w.sound.soundlevdone()
				return { phase: 'playing', round: { stage: 'cleared', t: 0 } }
			}
			return resolveRound(w)
		}
		case 'cleared':
			if (r.t + 1 < LEVEL_DONE_TICKS) return { phase: 'playing', round: { stage: 'cleared', t: r.t + 1 } }
			return resolveRound(w)
	}
}

/** One live tick: dodigger, domonsters, dobags, penalty→incmont, testpause, checklevdone. */
export function liveTick(w: World, s: Playing<LiveRound>): Playing | Paused {
	const m = w.main
	m.penalty = 0
	w.digger.dodigger()
	w.monsters.domonsters()
	w.bags.dobags()
	if (m.penalty > 8) w.monsters.incmont(m.penalty - 8)
	const paused = testpause(w)
	m.checklevdone()
	return paused ? { phase: 'paused', resume: s } : s
}

/** P was pressed: write "PRESS ANY KEY" into the top line, as the original did. */
function testpause(w: World): boolean {
	if (!w.controls.takePause()) return false
	w.sound.soundpause()
	w.main.cleartopline()
	w.drawing.outtext('PRESS ANY KEY', 80, 0, 1)
	return true
}

function pausedTick(w: World, s: Paused, intents: readonly Intent[]): Session {
	if (!intents.some(isPress)) return s
	w.main.cleartopline()
	w.scores.drawscores()
	w.scores.addscore(0)
	w.drawing.drawlives()
	w.controls.takePause()
	w.sound.soundpauseoff()
	return s.resume
}

/** Tail of Main.play(): level++ on a clear, lives-- on a death, endofgame on the last life. */
export function resolveRound(w: World): Session {
	const m = w.main
	const g = m.gamedat[m.curplayer]
	if (w.digger.countem() == 0) {
		g.level++
		if (g.level > 1000) g.level = 1000
		m.initlevel()
	}
	if (g.dead) {
		g.lives--
		w.drawing.drawlives()
		if (g.lives == 0) return endOfGame(w)
	}
	if (g.levdone) {
		g.level++
		if (g.level > 1000) g.level = 1000
		m.initlevel()
	}
	return afterRound(w)
}

/** Main.main()'s player loops: same player again, the other player's turn, or the title. */
export function afterRound(w: World): Session {
	const m = w.main
	const g = m.gamedat[m.curplayer]
	if (!g.dead && g.lives != 0) return startRound(w)
	if (m.gamedat[1 - m.curplayer].lives != 0) {
		m.curplayer = m.curplayer == 0 ? 1 : 0
		m.flashplayer = m.levnotdrawn = true
	}
	if (m.gamedat[0].lives == 0 && m.gamedat[1].lives == 0) return enterTitle(w)
	m.gamedat[m.curplayer].dead = false
	return startRound(w)
}

// ── end of game ─────────────────────────────────────────────────────────────

export function endOfGame(w: World): HighscoreInitials | GameOver {
	const m = w.main
	const d = w.drawing
	if (w.scores.endofgame()) {
		w.cga.gclear()
		w.scores.drawscores()
		d.outtext('PLAYER ' + (m.curplayer + 1), 108, 0, 2)
		d.outtext(' NEW HIGH SCORE ', 64, 40, 2)
		d.outtext('ENTER YOUR', 100, 70, 3)
		d.outtext(' INITIALS', 100, 90, 3)
		d.outtext('_ _ _', 128, 130, 3)
		w.sound.killsound()
		return {
			phase: 'highscore-initials',
			player: m.curplayer,
			entry: { kind: 'typing', slot: 0, letters: ['.', '.', '.'], cursorOn: true, t: 0 },
		}
	}
	m.cleartopline()
	d.outtext('GAME OVER', 104, 0, 3)
	w.sound.killsound()
	return { phase: 'gameover', t: 0 }
}

function gameOverTick(w: World, s: GameOver): Session {
	if (s.t + 1 < GAME_OVER_TICKS) return { phase: 'gameover', t: s.t + 1 }
	w.sound.setupsound()
	w.drawing.outtext('         ', 104, 0, 3)
	return afterRound(w)
}

function initialX(slot: number): number {
	return slot * 24 + 128
}

function withLetter(letters: Initials, slot: 0 | 1 | 2, l: InitialSlot): Initials {
	const next: [InitialSlot, InitialSlot, InitialSlot] = [letters[0], letters[1], letters[2]]
	next[slot] = l
	return next
}

function initialsTick(w: World, s: HighscoreInitials, intents: readonly Intent[]): Session {
	const e = s.entry
	if (e.kind === 'committed') {
		if (e.t + 1 < INITIALS_HOLD_TICKS) return { ...s, entry: { ...e, t: e.t + 1 } }
		w.sound.setupsound()
		w.cga.gclear()
		w.cga.ginten(0)
		w.scores.record(e.letters.join(''))
		return afterRound(w)
	}
	let { slot, letters, cursorOn, t } = e
	for (const i of intents) {
		if (i.type === 'Type') {
			w.cga.gwrite(initialX(slot), 130, i.glyph, 3)
			letters = withLetter(letters, slot, i.glyph)
			if (slot == 2) return { ...s, entry: { kind: 'committed', letters, t: 0 } }
			slot = slot == 0 ? 1 : 2
			cursorOn = true
			t = 0
			w.cga.gwrite(initialX(slot), 130, '_', 3)
		} else if (i.type === 'Erase' && slot > 0) {
			w.cga.gwrite(initialX(slot), 130, '_', 3)
			slot = slot == 2 ? 1 : 0
			letters = withLetter(letters, slot, '.')
			cursorOn = true
			t = 0
			w.cga.gwrite(initialX(slot), 130, '_', 3)
		}
	}
	t++
	if (t >= CURSOR_HALF_TICKS) {
		t = 0
		cursorOn = !cursorOn
		w.cga.gwrite(initialX(slot), 130, cursorOn ? '_' : ' ', 3)
	}
	return { ...s, entry: { kind: 'typing', slot, letters, cursorOn, t } }
}
