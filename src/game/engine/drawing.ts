/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Drawing.js. Futrega's progressive wipe (the `//js` sleeps in drawbackg
 * and drawfield) is dropped: the level appears in one tick, as in the C remaster.
 *
 * `field` is a dirt bitmask per 20×18 cell, 15×10: bits 0..4 horizontal slices, 6..11
 * vertical slices, 0x2000 "cell still has dirt".
 */

import type { SaveUnder } from '../pc/cga'
import type { World } from './world'

const bitmasks = [0xfffe, 0xfffd, 0xfffb, 0xfff7, 0xffef, 0xffdf, 0xffbf, 0xff7f, 0xfeff, 0xfdff, 0xfbff, 0xf7ff]

export class Drawing {
	private readonly w: World
	private readonly field1: number[] = new Array<number>(150).fill(0)
	private readonly field2: number[] = new Array<number>(150).fill(0)
	readonly field: number[] = new Array<number>(150).fill(0)

	private readonly diggerbuf: SaveUnder
	private readonly bagbufs: SaveUnder[]
	private readonly monbufs: SaveUnder[]
	private readonly bonusbuf: SaveUnder
	private readonly firebuf: SaveUnder

	private readonly monspr = [0, 0, 0, 0, 0, 0]
	private readonly monspd = [0, 0, 0, 0, 0, 0]
	private digspr = 0
	private digspd = 0
	private firespr = 0
	private readonly fireheight = 8

	constructor(w: World) {
		this.w = w
		const cga = w.cga
		this.diggerbuf = cga.allocSaveUnder(480)
		this.bagbufs = Array.from({ length: 7 }, () => cga.allocSaveUnder(480))
		this.monbufs = Array.from({ length: 6 }, () => cga.allocSaveUnder(480))
		this.bonusbuf = cga.allocSaveUnder(480)
		this.firebuf = cga.allocSaveUnder(128)
	}

	createdbfspr(): void {
		const s = this.w.sprites
		this.digspd = 1
		this.digspr = 0
		this.firespr = 0
		s.createspr(0, 0, this.diggerbuf, 4, 15, 0, 0)
		s.createspr(14, 81, this.bonusbuf, 4, 15, 0, 0)
		s.createspr(15, 82, this.firebuf, 2, this.fireheight, 0, 0)
	}

	creatembspr(): void {
		const s = this.w.sprites
		for (let i = 0; i < 7; i++) s.createspr(i + 1, 62, this.bagbufs[i], 4, 15, 0, 0)
		for (let i = 0; i < 6; i++) s.createspr(i + 8, 71, this.monbufs[i], 4, 15, 0, 0)
		this.createdbfspr()
		for (let i = 0; i < 6; i++) {
			this.monspr[i] = 0
			this.monspd[i] = 1
		}
	}

	drawbackg(l: number): void {
		for (let y = 14; y < 200; y += 4) for (let x = 0; x < 320; x += 20) this.w.sprites.drawmiscspr(x, y, 93 + l, 5, 4)
	}

	drawbonus(x: number, y: number): void {
		this.w.sprites.initspr(14, 81, 4, 15, 0, 0)
		this.w.sprites.movedrawspr(14, x, y)
	}

	drawbottomblob(x: number, y: number): void {
		const s = this.w.sprites
		s.initmiscspr(x - 4, y + 15, 6, 6)
		s.drawmiscspr(x - 4, y + 15, 105, 6, 6)
		s.getis()
	}

	/** t: facing 0/2/4/6, death sprites 10..15 (15 flattened under a bag), anything else draws nothing. */
	drawdigger(t: number, x: number, y: number, f: boolean): number {
		this.digspr += this.digspd
		if (this.digspr == 2 || this.digspr == 0) this.digspd = -this.digspd
		if (this.digspr > 2) this.digspr = 2
		if (this.digspr < 0) this.digspr = 0
		if (t >= 0 && t <= 6 && !((t & 1) != 0)) {
			this.w.sprites.initspr(0, (t + (f ? 0 : 1)) * 3 + this.digspr + 1, 4, 15, 0, 0)
			return this.w.sprites.drawspr(0, x, y)
		}
		if (t >= 10 && t <= 15) {
			this.w.sprites.initspr(0, 40 - t, 4, 15, 0, 0)
			return this.w.sprites.drawspr(0, x, y)
		}
		return 0
	}

	drawemerald(x: number, y: number): void {
		const s = this.w.sprites
		s.initmiscspr(x, y, 4, 10)
		s.drawmiscspr(x, y, 108, 4, 10)
		s.getis()
	}

	drawfield(): void {
		const field = this.field
		for (let x = 0; x < 15; x++)
			for (let y = 0; y < 10; y++) {
				if ((field[y * 15 + x] & 0x2000) == 0) {
					const xp = x * 20 + 12
					const yp = y * 18 + 18
					if ((field[y * 15 + x] & 0xfc0) != 0xfc0) {
						field[y * 15 + x] &= 0xd03f
						this.drawbottomblob(xp, yp - 15)
						this.drawbottomblob(xp, yp - 12)
						this.drawbottomblob(xp, yp - 9)
						this.drawbottomblob(xp, yp - 6)
						this.drawbottomblob(xp, yp - 3)
						this.drawtopblob(xp, yp + 3)
					}
					if ((field[y * 15 + x] & 0x1f) != 0x1f) {
						field[y * 15 + x] &= 0xdfe0
						this.drawrightblob(xp - 16, yp)
						this.drawrightblob(xp - 12, yp)
						this.drawrightblob(xp - 8, yp)
						this.drawrightblob(xp - 4, yp)
						this.drawleftblob(xp + 4, yp)
					}
					if (x < 14) if ((field[y * 15 + x + 1] & 0xfdf) != 0xfdf) this.drawrightblob(xp, yp)
					if (y < 9) if ((field[(y + 1) * 15 + x] & 0xfdf) != 0xfdf) this.drawbottomblob(xp, yp)
				}
			}
	}

	drawfire(x: number, y: number, t: number): number {
		const s = this.w.sprites
		if (t == 0) {
			this.firespr++
			if (this.firespr > 2) this.firespr = 0
			s.initspr(15, 82 + this.firespr, 2, this.fireheight, 0, 0)
		} else s.initspr(15, 84 + t, 2, this.fireheight, 0, 0)
		return s.drawspr(15, x, y)
	}

	drawfurryblob(x: number, y: number): void {
		const s = this.w.sprites
		s.initmiscspr(x - 4, y + 15, 6, 8)
		s.drawmiscspr(x - 4, y + 15, 107, 6, 8)
		s.getis()
	}

	drawgold(n: number, t: number, x: number, y: number): number {
		this.w.sprites.initspr(n, t + 62, 4, 15, 0, 0)
		return this.w.sprites.drawspr(n, x, y)
	}

	drawleftblob(x: number, y: number): void {
		const s = this.w.sprites
		s.initmiscspr(x - 8, y - 1, 2, 18)
		s.drawmiscspr(x - 8, y - 1, 104, 2, 18)
		s.getis()
	}

	drawlife(t: number, x: number, y: number): void {
		this.w.sprites.drawmiscspr(x, y, t + 110, 4, 12)
	}

	drawlives(): void {
		const main = this.w.main
		let n = main.getlives(1) - 1
		for (let l = 1; l < 5; l++) {
			this.drawlife(n > 0 ? 0 : 2, l * 20 + 60, 0)
			n--
		}
		if (main.getnplayers() == 2) {
			n = main.getlives(2) - 1
			for (let l = 1; l < 5; l++) {
				this.drawlife(n > 0 ? 1 : 2, 244 - l * 20, 0)
				n--
			}
		}
	}

	drawmon(n: number, nobf: boolean, dir: number, x: number, y: number): number {
		const s = this.w.sprites
		this.monspr[n] += this.monspd[n]
		if (this.monspr[n] == 2 || this.monspr[n] == 0) this.monspd[n] = -this.monspd[n]
		if (this.monspr[n] > 2) this.monspr[n] = 2
		if (this.monspr[n] < 0) this.monspr[n] = 0
		if (nobf) s.initspr(n + 8, this.monspr[n] + 69, 4, 15, 0, 0)
		else
			switch (dir) {
				case 0:
					s.initspr(n + 8, this.monspr[n] + 73, 4, 15, 0, 0)
					break
				case 4:
					s.initspr(n + 8, this.monspr[n] + 77, 4, 15, 0, 0)
			}
		return s.drawspr(n + 8, x, y)
	}

	drawmondie(n: number, nobf: boolean, dir: number, x: number, y: number): number {
		const s = this.w.sprites
		if (nobf) s.initspr(n + 8, 72, 4, 15, 0, 0)
		else
			switch (dir) {
				case 0:
					s.initspr(n + 8, 76, 4, 15, 0, 0)
					break
				case 4:
					s.initspr(n + 8, 80, 4, 14, 0, 0)
			}
		return s.drawspr(n + 8, x, y)
	}

	drawrightblob(x: number, y: number): void {
		const s = this.w.sprites
		s.initmiscspr(x + 16, y - 1, 2, 18)
		s.drawmiscspr(x + 16, y - 1, 102, 2, 18)
		s.getis()
	}

	drawsquareblob(x: number, y: number): void {
		const s = this.w.sprites
		s.initmiscspr(x - 4, y + 17, 6, 6)
		s.drawmiscspr(x - 4, y + 17, 106, 6, 6)
		s.getis()
	}

	drawstatics(): void {
		const cur = this.w.main.getcplayer()
		for (let x = 0; x < 15; x++)
			for (let y = 0; y < 10; y++)
				if (cur == 0) this.field[y * 15 + x] = this.field1[y * 15 + x]
				else this.field[y * 15 + x] = this.field2[y * 15 + x]
		this.w.cga.ginten(0)
		this.drawbackg(this.w.main.levplan())
		this.drawfield()
	}

	drawtopblob(x: number, y: number): void {
		const s = this.w.sprites
		s.initmiscspr(x - 4, y - 6, 6, 6)
		s.drawmiscspr(x - 4, y - 6, 103, 6, 6)
		s.getis()
	}

	eatfield(x: number, y: number, dir: number): void {
		const field = this.field
		let h = Math.floor((x - 12) / 20)
		let xr = Math.floor(((x - 12) % 20) / 4)
		let v = Math.floor((y - 18) / 18)
		let yr = Math.floor(((y - 18) % 18) / 3)
		this.w.main.incpenalty()
		switch (dir) {
			case 0:
				h++
				field[v * 15 + h] &= bitmasks[xr]
				if ((field[v * 15 + h] & 0x1f) != 0) break
				field[v * 15 + h] &= 0xdfff
				break
			case 4:
				xr--
				if (xr < 0) {
					xr += 5
					h--
				}
				field[v * 15 + h] &= bitmasks[xr]
				if ((field[v * 15 + h] & 0x1f) != 0) break
				field[v * 15 + h] &= 0xdfff
				break
			case 2:
				yr--
				if (yr < 0) {
					yr += 6
					v--
				}
				field[v * 15 + h] &= bitmasks[6 + yr]
				if ((field[v * 15 + h] & 0xfc0) != 0) break
				field[v * 15 + h] &= 0xdfff
				break
			case 6:
				v++
				field[v * 15 + h] &= bitmasks[6 + yr]
				if ((field[v * 15 + h] & 0xfc0) != 0) break
				field[v * 15 + h] &= 0xdfff
		}
	}

	eraseemerald(x: number, y: number): void {
		const s = this.w.sprites
		s.initmiscspr(x, y, 4, 10)
		s.drawmiscspr(x, y, 109, 4, 10)
		s.getis()
	}

	initdbfspr(): void {
		const s = this.w.sprites
		this.digspd = 1
		this.digspr = 0
		this.firespr = 0
		s.initspr(0, 0, 4, 15, 0, 0)
		s.initspr(14, 81, 4, 15, 0, 0)
		s.initspr(15, 82, 2, this.fireheight, 0, 0)
	}

	initmbspr(): void {
		const s = this.w.sprites
		for (let i = 1; i <= 7; i++) s.initspr(i, 62, 4, 15, 0, 0)
		for (let i = 8; i <= 13; i++) s.initspr(i, 71, 4, 15, 0, 0)
		this.initdbfspr()
	}

	makefield(): void {
		const main = this.w.main
		for (let x = 0; x < 15; x++)
			for (let y = 0; y < 10; y++) {
				this.field[y * 15 + x] = -1
				const c = main.getlevch(x, y, main.levplan())
				if (c == 'S' || c == 'V') this.field[y * 15 + x] &= 0xd03f
				if (c == 'S' || c == 'H') this.field[y * 15 + x] &= 0xdfe0
				if (main.getcplayer() == 0) this.field1[y * 15 + x] = this.field[y * 15 + x]
				else this.field2[y * 15 + x] = this.field[y * 15 + x]
			}
	}

	outtext(p: string, x: number, y: number, c: number): void {
		for (let i = 0; i < p.length; i++) {
			this.w.cga.gwrite(x, y, p.charAt(i), c)
			x += 12
		}
	}

	savefield(): void {
		const cur = this.w.main.getcplayer()
		for (let x = 0; x < 15; x++)
			for (let y = 0; y < 10; y++)
				if (cur == 0) this.field1[y * 15 + x] = this.field[y * 15 + x]
				else this.field2[y * 15 + x] = this.field[y * 15 + x]
	}
}
