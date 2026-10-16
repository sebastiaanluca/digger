/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Scores.js. endofgame()/getinitials() waited on the keyboard inside a
 * busy loop; their screens are session phases now (session.ts) and only the table logic stays.
 * scorehigh[i+1] and scoreinit[i] hold rank i (1..10); scoreinit[0] is the entry being typed.
 */

import type { HighScore } from '../host/hiscore-store'
import type { World } from './world'

export const BONUS_LIFE_EVERY = 20000

export class Scores {
	private readonly w: World
	private readonly scorehigh = new Array<number>(12).fill(0)
	private readonly scoreinit = new Array<string>(11).fill('...')
	private scoret = 0
	score1 = 0
	score2 = 0
	private nextbs1 = 0
	private nextbs2 = 0
	private readonly bonusscore = BONUS_LIFE_EVERY

	constructor(w: World) {
		this.w = w
		this.loadscores()
	}

	addscore(score: number): void {
		const { main, drawing } = this.w
		if (main.getcplayer() == 0) {
			this.score1 += score
			if (this.score1 > 999999) this.score1 = 0
			this.writenum(this.score1, 0, 0, 6, 1)
			if (this.score1 >= this.nextbs1) {
				main.addlife(1)
				drawing.drawlives()
				this.nextbs1 += this.bonusscore
			}
		} else {
			this.score2 += score
			if (this.score2 > 999999) this.score2 = 0
			if (this.score2 < 100000) this.writenum(this.score2, 236, 0, 6, 1)
			else this.writenum(this.score2, 248, 0, 6, 1)
			if (this.score2 > this.nextbs2) {
				/* Player 2 doesn't get the life until >20,000 ! */
				main.addlife(2)
				drawing.drawlives()
				this.nextbs2 += this.bonusscore
			}
		}
		main.incpenalty()
		main.incpenalty()
		main.incpenalty()
	}

	drawscores(): void {
		this.writenum(this.score1, 0, 0, 6, 3)
		if (this.w.main.getnplayers() == 2)
			if (this.score2 < 100000) this.writenum(this.score2, 236, 0, 6, 3)
			else this.writenum(this.score2, 248, 0, 6, 3)
	}

	/** Top of endofgame(): settles the score and says whether it beats the 10th row. */
	endofgame(): boolean {
		this.addscore(0)
		if (this.w.main.getcplayer() == 0) this.scoret = this.score1
		else this.scoret = this.score2
		return this.scoret > this.scorehigh[11]
	}

	initscores(): void {
		this.addscore(0)
	}

	private loadscores(): void {
		const table = this.w.hiscores.load()
		for (let i = 1; i < 11; i++) {
			const row = table[i - 1]
			this.scoreinit[i] = row ? row.initials : '...'
			this.scorehigh[i + 1] = row ? row.score : 0
		}
	}

	private savescores(): void {
		const table: HighScore[] = []
		for (let i = 1; i < 11; i++) table.push({ initials: this.scoreinit[i], score: this.scorehigh[i + 1] })
		this.w.hiscores.save(table)
	}

	/** After the initials screen: shufflehigh() + savescores(), initials included. */
	record(initials: string): void {
		this.scoreinit[0] = initials
		this.shufflehigh()
		this.savescores()
	}

	private numtostring(n: number): string {
		let x: number
		let p = ''
		for (x = 0; x < 6; x++) {
			p = String(n % 10) + p
			n = Math.floor(n / 10)
			if (n == 0) {
				x++
				break
			}
		}
		for (; x < 6; x++) p = ' ' + p
		return p
	}

	scorebonus(): void {
		this.addscore(1000)
	}

	scoreeatm(): void {
		const digger = this.w.digger
		this.addscore(digger.eatmsc * 200)
		digger.eatmsc <<= 1
	}

	scoreemerald(): void {
		this.addscore(25)
	}

	scoregold(): void {
		this.addscore(500)
	}

	scorekill(): void {
		this.addscore(250)
	}

	scoreoctave(): void {
		this.addscore(250)
	}

	showtable(): void {
		const drawing = this.w.drawing
		drawing.outtext('HIGH SCORES', 16, 25, 3)
		let col = 2
		for (let i = 1; i < 11; i++) {
			const hsbuf = this.scoreinit[i] + '  ' + this.numtostring(this.scorehigh[i + 1])
			drawing.outtext(hsbuf, 16, 31 + 13 * i, col)
			col = 1
		}
	}

	private shufflehigh(): void {
		let i: number
		let j: number
		for (j = 10; j > 1; j--) if (this.scoret < this.scorehigh[j]) break
		for (i = 10; i > j; i--) {
			this.scorehigh[i + 1] = this.scorehigh[i]
			this.scoreinit[i] = this.scoreinit[i - 1]
		}
		this.scorehigh[j + 1] = this.scoret
		this.scoreinit[j] = this.scoreinit[0]
	}

	writecurscore(bp6: number): void {
		if (this.w.main.getcplayer() == 0) this.writenum(this.score1, 0, 0, 6, bp6)
		else if (this.score2 < 100000) this.writenum(this.score2, 236, 0, 6, bp6)
		else this.writenum(this.score2, 248, 0, 6, bp6)
	}

	private writenum(n: number, x: number, y: number, w: number, c: number): void {
		let xp = (w - 1) * 12 + x
		while (w > 0) {
			const d = n % 10
			if (w > 1 || d > 0) this.w.cga.gwrite(xp, y, String.fromCharCode(48 + d), c)
			n = Math.floor(n / 10)
			w--
			xp -= 12
		}
	}

	zeroscores(): void {
		this.score2 = 0
		this.score1 = 0
		this.scoret = 0
		this.nextbs1 = this.bonusscore
		this.nextbs2 = this.bonusscore
	}
}
