/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Main.js: player state and level helpers. The main()/play() control
 * flow (setInterval promises and busy-waits in Futrega) lives in session.ts as a state machine.
 */

import { getLevCh, levof10, levplan } from '../data/levels'
import type { PlayerCount, PlayerIndex } from './types'
import type { World } from './world'

export interface GameDat {
	lives: number
	/** 1..1000 */
	level: number
	dead: boolean
	levdone: boolean
}

/** Redraw order for the 16 sprite slots: fire and digger end up on top, bonus at the bottom. */
export const digsprorder = [14, 13, 7, 6, 5, 4, 3, 2, 1, 12, 11, 10, 9, 8, 15, 0]

export class Main {
	private readonly w: World
	readonly gamedat: [GameDat, GameDat] = [
		{ lives: 0, level: 0, dead: false, levdone: false },
		{ lives: 0, level: 0, dead: false, levdone: false },
	]
	curplayer: PlayerIndex = 0
	nplayers: PlayerCount = 1
	penalty = 0
	levnotdrawn = false
	flashplayer = false
	pldispbuf = ''
	private randv: number

	constructor(w: World, seed: number) {
		this.w = w
		this.randv = seed & 0x7fffffff
	}

	/** pl is 1-based, as in Futrega. */
	addlife(pl: number): void {
		this.gamedat[pl - 1].lives++
		this.w.sound.sound1up()
	}

	checklevdone(): void {
		const d = this.w.digger
		if ((d.countem() == 0 || this.w.monsters.monleft() == 0) && d.digonscr) this.gamedat[this.curplayer].levdone = true
		else this.gamedat[this.curplayer].levdone = false
	}

	cleartopline(): void {
		this.w.drawing.outtext('                          ', 0, 0, 3)
		this.w.drawing.outtext(' ', 308, 0, 3)
	}

	drawscreen(): void {
		this.w.drawing.creatembspr()
		this.w.drawing.drawstatics()
		this.w.bags.drawbags()
		this.w.digger.drawemeralds()
		this.w.digger.initdigger()
		this.w.monsters.initmonsters()
	}

	getnplayers(): number {
		return this.nplayers
	}

	getcplayer(): PlayerIndex {
		return this.curplayer
	}

	getlevch(x: number, y: number, l: number): string {
		if (l == 0) l++
		return getLevCh(x, y, l)
	}

	/** pl is 1-based, as in Futrega. */
	getlives(pl: number): number {
		return this.gamedat[pl - 1].lives
	}

	incpenalty(): void {
		this.penalty++
	}

	initchars(): void {
		this.w.drawing.initmbspr()
		this.w.digger.initdigger()
		this.w.monsters.initmonsters()
	}

	initlevel(): void {
		this.gamedat[this.curplayer].levdone = false
		this.w.drawing.makefield()
		this.w.digger.makeemfield()
		this.w.bags.initbags()
		this.levnotdrawn = true
	}

	levno(): number {
		return this.gamedat[this.curplayer].level
	}

	levof10(): number {
		return levof10(this.gamedat[this.curplayer].level)
	}

	/** 12345678, then 678, then (5678) 247 times, then 5 forever. */
	levplan(): number {
		return levplan(this.levno())
	}

	/** C's randv = randv*0x15a4e35+1 in 32-bit arithmetic; Math.imul keeps the low bits exact. */
	randno(n: number): number {
		this.randv = (Math.imul(this.randv, 0x15a4e35) + 1) & 0x7fffffff
		return this.randv % n
	}

	setdead(bp6: boolean): void {
		this.gamedat[this.curplayer].dead = bp6
	}

	shownplayers(): void {
		const d = this.w.drawing
		if (this.nplayers == 1) {
			d.outtext('ONE', 220, 25, 3)
			d.outtext(' PLAYER ', 192, 39, 3)
		} else {
			d.outtext('TWO', 220, 25, 3)
			d.outtext(' PLAYERS', 184, 39, 3)
		}
	}

	switchnplayers(): void {
		this.nplayers = this.nplayers == 1 ? 2 : 1
	}
}
