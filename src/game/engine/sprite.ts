/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Sprite.js. Sixteen sprite slots plus the misc slot (16), redraw
 * ordering and rectangle collision. The collision mask returned by drawspr/movedrawspr is how
 * every rule learns what it touched: bit n set means slot n overlaps.
 */

import type { SaveUnder } from '../pc/cga'
import type { World } from './world'

const MISC = 16

function falses(n: number): boolean[] {
	return new Array<boolean>(n).fill(false)
}
function zeros(n: number): number[] {
	return new Array<number>(n).fill(0)
}

export class Sprites {
	private readonly w: World
	private readonly sprrdrwf = falses(17)
	private readonly sprrecf = falses(17)
	private readonly sprenf = falses(16)
	private readonly sprch = zeros(17)
	private readonly sprmov: (SaveUnder | null)[] = new Array<SaveUnder | null>(16).fill(null)
	private readonly sprx = zeros(17)
	private readonly spry = zeros(17)
	private readonly sprwid = zeros(17)
	private readonly sprhei = zeros(17)
	private readonly sprbwid = zeros(16)
	private readonly sprbhei = zeros(16)
	private readonly sprnch = zeros(16)
	private readonly sprnwid = zeros(16)
	private readonly sprnhei = zeros(16)
	private readonly sprnbwid = zeros(16)
	private readonly sprnbhei = zeros(16)
	private readonly defsprorder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
	private sprorder: readonly number[] = this.defsprorder

	constructor(w: World) {
		this.w = w
	}

	private bcollide(bx: number, si: number): boolean {
		const { sprx, spry, sprwid, sprhei, sprbwid, sprbhei } = this
		if (sprx[bx] >= sprx[si]) {
			if (sprx[bx] + sprbwid[bx] > sprwid[si] * 4 + sprx[si] - sprbwid[si] - 1) return false
		} else if (sprx[si] + sprbwid[si] > sprwid[bx] * 4 + sprx[bx] - sprbwid[bx] - 1) return false
		if (spry[bx] >= spry[si]) {
			if (spry[bx] + sprbhei[bx] <= sprhei[si] + spry[si] - sprbhei[si] - 1) return true
			return false
		}
		if (spry[si] + sprbhei[si] <= sprhei[bx] + spry[bx] - sprbhei[bx] - 1) return true
		return false
	}

	/** The ±320/±2 probes are CGA bank wrap-around, kept because they decide real collisions. */
	private bcollides(bx: number): number {
		const si = bx
		let ax = 0
		let dx = 0
		bx = 0
		do {
			if (this.sprenf[bx] && bx != si) {
				if (this.bcollide(bx, si)) ax |= 1 << dx
				this.sprx[bx] += 320
				this.spry[bx] -= 2
				if (this.bcollide(bx, si)) ax |= 1 << dx
				this.sprx[bx] -= 640
				this.spry[bx] += 4
				if (this.bcollide(bx, si)) ax |= 1 << dx
				this.sprx[bx] += 320
				this.spry[bx] -= 2
			}
			bx++
			dx++
		} while (dx != 16)
		return ax
	}

	private clearrdrwf(): void {
		this.clearrecf()
		this.sprrdrwf.fill(false)
	}

	private clearrecf(): void {
		this.sprrecf.fill(false)
	}

	private collide(bx: number, si: number): boolean {
		const { sprx, spry, sprwid, sprhei } = this
		if (sprx[bx] >= sprx[si]) {
			if (sprx[bx] > sprwid[si] * 4 + sprx[si] - 1) return false
		} else if (sprx[si] > sprwid[bx] * 4 + sprx[bx] - 1) return false
		if (spry[bx] >= spry[si]) {
			if (spry[bx] <= sprhei[si] + spry[si] - 1) return true
			return false
		}
		if (spry[si] <= sprhei[bx] + spry[bx] - 1) return true
		return false
	}

	createspr(n: number, ch: number, mov: SaveUnder, wid: number, hei: number, bwid: number, bhei: number): void {
		const i = n & 15
		this.sprnch[i] = this.sprch[i] = ch
		this.sprmov[i] = mov
		this.sprnwid[i] = this.sprwid[i] = wid
		this.sprnhei[i] = this.sprhei[i] = hei
		this.sprnbwid[i] = this.sprbwid[i] = bwid
		this.sprnbhei[i] = this.sprbhei[i] = bhei
		this.sprenf[i] = false
	}

	drawmiscspr(x: number, y: number, ch: number, wid: number, hei: number): void {
		this.sprx[MISC] = x & -4
		this.spry[MISC] = y
		this.sprch[MISC] = ch
		this.sprwid[MISC] = wid
		this.sprhei[MISC] = hei
		this.w.cga.gputim(this.sprx[MISC], this.spry[MISC], this.sprch[MISC], this.sprwid[MISC], this.sprhei[MISC])
	}

	drawspr(n: number, x: number, y: number): number {
		const bx = n & 15
		x &= -4
		this.clearrdrwf()
		this.setrdrwflgs(bx)
		const t1 = this.sprx[bx]
		const t2 = this.spry[bx]
		const t3 = this.sprwid[bx]
		const t4 = this.sprhei[bx]
		this.sprx[bx] = x
		this.spry[bx] = y
		this.sprwid[bx] = this.sprnwid[bx]
		this.sprhei[bx] = this.sprnhei[bx]
		this.clearrecf()
		this.setrdrwflgs(bx)
		this.sprhei[bx] = t4
		this.sprwid[bx] = t3
		this.spry[bx] = t2
		this.sprx[bx] = t1
		this.sprrdrwf[bx] = true
		this.putis()
		this.sprx[bx] = x
		this.spry[bx] = y
		this.sprch[bx] = this.sprnch[bx]
		this.sprwid[bx] = this.sprnwid[bx]
		this.sprhei[bx] = this.sprnhei[bx]
		this.sprbwid[bx] = this.sprnbwid[bx]
		this.sprbhei[bx] = this.sprnbhei[bx]
		this.geti(bx)
		this.putims()
		return this.bcollides(bx)
	}

	erasespr(n: number): void {
		const bx = n & 15
		this.puti(bx)
		this.sprenf[bx] = false
		this.clearrdrwf()
		this.setrdrwflgs(bx)
		this.putims()
	}

	getis(): void {
		for (let i = 0; i < 16; i++) if (this.sprrdrwf[i]) this.geti(i)
		this.putims()
	}

	initmiscspr(x: number, y: number, wid: number, hei: number): void {
		this.sprx[MISC] = x
		this.spry[MISC] = y
		this.sprwid[MISC] = wid
		this.sprhei[MISC] = hei
		this.clearrdrwf()
		this.setrdrwflgs(MISC)
		this.putis()
	}

	initspr(n: number, ch: number, wid: number, hei: number, bwid: number, bhei: number): void {
		const i = n & 15
		this.sprnch[i] = ch
		this.sprnwid[i] = wid
		this.sprnhei[i] = hei
		this.sprnbwid[i] = bwid
		this.sprnbhei[i] = bhei
	}

	movedrawspr(n: number, x: number, y: number): number {
		const bx = n & 15
		this.sprx[bx] = x & -4
		this.spry[bx] = y
		this.sprch[bx] = this.sprnch[bx]
		this.sprwid[bx] = this.sprnwid[bx]
		this.sprhei[bx] = this.sprnhei[bx]
		this.sprbwid[bx] = this.sprnbwid[bx]
		this.sprbhei[bx] = this.sprnbhei[bx]
		this.clearrdrwf()
		this.setrdrwflgs(bx)
		this.putis()
		this.geti(bx)
		this.sprenf[bx] = true
		this.sprrdrwf[bx] = true
		this.putims()
		return this.bcollides(bx)
	}

	private putims(): void {
		for (let i = 0; i < 16; i++) {
			const j = this.sprorder[i]
			if (this.sprrdrwf[j]) this.w.cga.gputim(this.sprx[j], this.spry[j], this.sprch[j], this.sprwid[j], this.sprhei[j])
		}
	}

	private putis(): void {
		for (let i = 0; i < 16; i++) if (this.sprrdrwf[i]) this.puti(i)
	}

	private geti(i: number): void {
		const mov = this.sprmov[i]
		if (mov) this.w.cga.ggeti(this.sprx[i], this.spry[i], mov, this.sprwid[i], this.sprhei[i])
	}

	private puti(i: number): void {
		const mov = this.sprmov[i]
		if (mov) this.w.cga.gputi(this.sprx[i], this.spry[i], mov, this.sprwid[i], this.sprhei[i])
	}

	private setrdrwflgs(n: number): void {
		if (!this.sprrecf[n]) {
			this.sprrecf[n] = true
			for (let i = 0; i < 16; i++)
				if (this.sprenf[i] && i != n) {
					if (this.collide(i, n)) {
						this.sprrdrwf[i] = true
						this.setrdrwflgs(i)
					}
					this.sprx[i] += 320
					this.spry[i] -= 2
					if (this.collide(i, n)) {
						this.sprrdrwf[i] = true
						this.setrdrwflgs(i)
					}
					this.sprx[i] -= 640
					this.spry[i] += 4
					if (this.collide(i, n)) {
						this.sprrdrwf[i] = true
						this.setrdrwflgs(i)
					}
					this.sprx[i] += 320
					this.spry[i] -= 2
				}
		}
	}

	setsprorder(newsprorder: readonly number[] | null): void {
		this.sprorder = newsprorder ?? this.defsprorder
	}
}
