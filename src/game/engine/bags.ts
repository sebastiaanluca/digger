/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Bags.js. Slots 1..7 (slot 0 unused so a bag id is its sprite slot).
 * dir -1 resting, 0/4 pushed, 6 falling; gt != 0 means the bag broke open into gold.
 */

import { reversedir } from './types'
import type { World } from './world'

class BagData {
	x = 0
	y = 0
	h = 0
	v = 0
	xr = 0
	yr = 0
	dir = 0
	wt = 0
	gt = 0
	fallh = 0
	wobbling = false
	unfallen = false
	exist = false

	copyFrom(t: BagData): void {
		this.x = t.x
		this.y = t.y
		this.h = t.h
		this.v = t.v
		this.xr = t.xr
		this.yr = t.yr
		this.dir = t.dir
		this.wt = t.wt
		this.gt = t.gt
		this.fallh = t.fallh
		this.wobbling = t.wobbling
		this.unfallen = t.unfallen
		this.exist = t.exist
	}
}

function bagSet(): BagData[] {
	return Array.from({ length: 8 }, () => new BagData())
}

const wblanim = [2, 0, 1, 0]

export class Bags {
	private readonly w: World
	private readonly bagdat1 = bagSet()
	private readonly bagdat2 = bagSet()
	private readonly bagdat = bagSet()
	private pushcount = 0
	private goldtime = 0

	constructor(w: World) {
		this.w = w
	}

	bagbits(): number {
		let bags = 0
		for (let bag = 1, b = 2; bag < 8; bag++, b <<= 1) if (this.bagdat[bag].exist) bags |= b
		return bags
	}

	private baghitground(bag: number): void {
		const bd = this.bagdat[bag]
		if (bd.dir == 6 && bd.fallh > 1) bd.gt = 1
		else bd.fallh = 0
		bd.dir = -1
		bd.wt = 15
		bd.wobbling = false
		const clbits = this.w.drawing.drawgold(bag, 0, bd.x, bd.y)
		this.w.main.incpenalty()
		for (let bn = 1, b = 2; bn < 8; bn++, b <<= 1) if ((b & clbits) != 0) this.removebag(bn)
	}

	bagy(bag: number): number {
		return this.bagdat[bag].y
	}

	cleanupbags(): void {
		this.w.sound.soundfalloff()
		for (let bpa = 1; bpa < 8; bpa++) {
			const bd = this.bagdat[bpa]
			if (bd.exist && ((bd.h == 7 && bd.v == 9) || bd.xr != 0 || bd.yr != 0 || bd.gt != 0 || bd.fallh != 0 || bd.wobbling)) {
				bd.exist = false
				this.w.sprites.erasespr(bpa)
			}
			if (this.w.main.getcplayer() == 0) this.bagdat1[bpa].copyFrom(bd)
			else this.bagdat2[bpa].copyFrom(bd)
		}
	}

	dobags(): void {
		const { sound, drawing, main, monsters } = this.w
		let soundfalloffflag = true
		let soundwobbleoffflag = true
		for (let bag = 1; bag < 8; bag++) {
			const bd = this.bagdat[bag]
			if (bd.exist) {
				if (bd.gt != 0) {
					if (bd.gt == 1) {
						sound.soundbreak()
						drawing.drawgold(bag, 4, bd.x, bd.y)
						main.incpenalty()
					}
					if (bd.gt == 3) {
						drawing.drawgold(bag, 5, bd.x, bd.y)
						main.incpenalty()
					}
					if (bd.gt == 5) {
						drawing.drawgold(bag, 6, bd.x, bd.y)
						main.incpenalty()
					}
					bd.gt++
					if (bd.gt == this.goldtime) this.removebag(bag)
					else if (bd.v < 9 && bd.gt < this.goldtime - 10)
						if ((monsters.getfield(bd.h, bd.v + 1) & 0x2000) == 0) bd.gt = this.goldtime - 10
				} else this.updatebag(bag)
			}
		}
		for (let bag = 1; bag < 8; bag++) {
			const bd = this.bagdat[bag]
			if (bd.dir == 6 && bd.exist) soundfalloffflag = false
			if (bd.dir != 6 && bd.wobbling && bd.exist) soundwobbleoffflag = false
		}
		if (soundfalloffflag) sound.soundfalloff()
		if (soundwobbleoffflag) sound.soundwobbleoff()
	}

	drawbags(): void {
		for (let bag = 1; bag < 8; bag++) {
			const bd = this.bagdat[bag]
			if (this.w.main.getcplayer() == 0) bd.copyFrom(this.bagdat1[bag])
			else bd.copyFrom(this.bagdat2[bag])
			if (bd.exist) this.w.sprites.movedrawspr(bag, bd.x, bd.y)
		}
	}

	getbagdir(bag: number): number {
		if (this.bagdat[bag].exist) return this.bagdat[bag].dir
		return -1
	}

	private getgold(bag: number): void {
		const { drawing, main, scores, sound, digger, monsters } = this.w
		const clbits = drawing.drawgold(bag, 6, this.bagdat[bag].x, this.bagdat[bag].y)
		main.incpenalty()
		if ((clbits & 1) != 0) {
			scores.scoregold()
			sound.soundgold()
			digger.digtime = 0
		} else monsters.mongold()
		this.removebag(bag)
	}

	getnmovingbags(): number {
		let n = 0
		for (let bag = 1; bag < 8; bag++) {
			const bd = this.bagdat[bag]
			if (bd.exist && bd.gt < 10 && (bd.gt != 0 || bd.wobbling)) n++
		}
		return n
	}

	initbags(): void {
		const main = this.w.main
		this.pushcount = 0
		this.goldtime = 150 - main.levof10() * 10
		for (let bag = 1; bag < 8; bag++) this.bagdat[bag].exist = false
		let bag = 1
		for (let x = 0; x < 15; x++)
			for (let y = 0; y < 10; y++)
				if (main.getlevch(x, y, main.levplan()) == 'B')
					if (bag < 8) {
						const bd = this.bagdat[bag]
						bd.exist = true
						bd.gt = 0
						bd.fallh = 0
						bd.dir = -1
						bd.wobbling = false
						bd.wt = 15
						bd.unfallen = true
						bd.x = x * 20 + 12
						bd.y = y * 18 + 18
						bd.h = x
						bd.v = y
						bd.xr = 0
						bd.yr = 0
						bag++
					}
		if (main.getcplayer() == 0) for (let i = 1; i < 8; i++) this.bagdat1[i].copyFrom(this.bagdat[i])
		else for (let i = 1; i < 8; i++) this.bagdat2[i].copyFrom(this.bagdat[i])
	}

	private pushbag(bag: number, dir: number): boolean {
		const { drawing, main, digger, monsters } = this.w
		const bd = this.bagdat[bag]
		let clbits: number
		let push = true
		let x = bd.x
		let y = bd.y
		const ox = x
		const oy = y
		const h = bd.h
		const v = bd.v
		if (bd.gt != 0) {
			this.getgold(bag)
			return true
		}
		if (bd.dir == 6 && (dir == 4 || dir == 0)) {
			clbits = drawing.drawgold(bag, 3, x, y)
			main.incpenalty()
			if ((clbits & 1) != 0 && digger.diggery >= y) digger.killdigger(1, bag)
			if ((clbits & 0x3f00) != 0) monsters.squashmonsters(bag, clbits)
			return true
		}
		if ((x == 292 && dir == 0) || (x == 12 && dir == 4) || (y == 180 && dir == 6) || (y == 18 && dir == 2)) push = false
		if (push) {
			switch (dir) {
				case 0:
					x += 4
					break
				case 4:
					x -= 4
					break
				case 6:
					if (bd.unfallen) {
						bd.unfallen = false
						drawing.drawsquareblob(x, y)
						drawing.drawtopblob(x, y + 21)
					} else drawing.drawfurryblob(x, y)
					drawing.eatfield(x, y, dir)
					digger.killemerald(h, v)
					y += 6
			}
			switch (dir) {
				case 6:
					clbits = drawing.drawgold(bag, 3, x, y)
					main.incpenalty()
					if ((clbits & 1) != 0 && digger.diggery >= y) digger.killdigger(1, bag)
					if ((clbits & 0x3f00) != 0) monsters.squashmonsters(bag, clbits)
					break
				case 0:
				case 4:
					bd.wt = 15
					bd.wobbling = false
					clbits = drawing.drawgold(bag, 0, x, y)
					main.incpenalty()
					this.pushcount = 1
					if ((clbits & 0xfe) != 0)
						if (!this.pushbags(dir, clbits)) {
							x = ox
							y = oy
							drawing.drawgold(bag, 0, ox, oy)
							main.incpenalty()
							push = false
						}
					if ((clbits & 1) != 0 || (clbits & 0x3f00) != 0) {
						x = ox
						y = oy
						drawing.drawgold(bag, 0, ox, oy)
						main.incpenalty()
						push = false
					}
			}
			if (push) bd.dir = dir
			else bd.dir = reversedir(dir)
			bd.x = x
			bd.y = y
			bd.h = Math.floor((x - 12) / 20)
			bd.v = Math.floor((y - 18) / 18)
			bd.xr = (x - 12) % 20
			bd.yr = (y - 18) % 18
		}
		return push
	}

	pushbags(dir: number, bits: number): boolean {
		let push = true
		for (let bag = 1, bit = 2; bag < 8; bag++, bit <<= 1) if ((bits & bit) != 0) if (!this.pushbag(bag, dir)) push = false
		return push
	}

	pushudbags(bits: number): boolean {
		let push = true
		for (let bag = 1, b = 2; bag < 8; bag++, b <<= 1)
			if ((bits & b) != 0)
				if (this.bagdat[bag].gt != 0) this.getgold(bag)
				else push = false
		return push
	}

	private removebag(bag: number): void {
		if (this.bagdat[bag].exist) {
			this.bagdat[bag].exist = false
			this.w.sprites.erasespr(bag)
		}
	}

	removebags(bits: number): void {
		for (let bag = 1, b = 2; bag < 8; bag++, b <<= 1) if (this.bagdat[bag].exist && (bits & b) != 0) this.removebag(bag)
	}

	private updatebag(bag: number): void {
		const { sound, drawing, main, monsters, digger } = this.w
		const bd = this.bagdat[bag]
		const x = bd.x
		const h = bd.h
		const xr = bd.xr
		const y = bd.y
		const v = bd.v
		const yr = bd.yr
		switch (bd.dir) {
			case -1:
				if (y < 180 && xr == 0) {
					if (bd.wobbling) {
						if (bd.wt == 0) {
							bd.dir = 6
							sound.soundfall()
							break
						}
						bd.wt--
						const wbl = bd.wt % 8
						if (!((wbl & 1) != 0)) {
							drawing.drawgold(bag, wblanim[wbl >> 1], x, y)
							main.incpenalty()
							sound.soundwobble()
						}
					} else if ((monsters.getfield(h, v + 1) & 0xfdf) != 0xfdf)
						if (!digger.checkdiggerunderbag(h, v + 1)) bd.wobbling = true
				} else {
					bd.wt = 15
					bd.wobbling = false
				}
				break
			case 0:
			case 4:
				if (xr == 0)
					if (y < 180 && (monsters.getfield(h, v + 1) & 0xfdf) != 0xfdf) {
						bd.dir = 6
						bd.wt = 0
						sound.soundfall()
					} else this.baghitground(bag)
				break
			case 6:
				if (yr == 0) bd.fallh++
				if (y >= 180) this.baghitground(bag)
				else if ((monsters.getfield(h, v + 1) & 0xfdf) == 0xfdf) if (yr == 0) this.baghitground(bag)
				monsters.checkmonscared(bd.h)
		}
		if (bd.dir != -1)
			if (bd.dir != 6 && this.pushcount != 0) this.pushcount--
			else this.pushbag(bag, bd.dir)
	}
}
