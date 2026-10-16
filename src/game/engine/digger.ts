/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Digger.js. The canvas, touch and key handling moved to host/.
 *
 * deathstage: 1 alive or squashed under a falling bag (digonscr tells which), 2 grave,
 * 3 hit by a monster (one tick), 4 dirge, 5 bouncing.
 */

import { reversedir } from './types'
import type { World } from './world'

const embox = [8, 12, 12, 9, 16, 12, 6, 9]
const deatharc = [3, 5, 6, 6, 5, 3, 0]

export class Digger {
	private readonly w: World

	diggerx = 0
	diggery = 0
	private diggerh = 0
	private diggerv = 0
	private diggerrx = 0
	private diggerry = 0
	private digmdir = 0
	private digdir = 0
	digtime = 0
	private rechargetime = 0
	private firex = 0
	private firey = 0
	private firedir = 0
	private expsn = 0
	private deathstage = 0
	private deathbag = 0
	private deathani = 0
	private deathtime = 0
	private startbonustimeleft = 0
	private bonustimeleft = 0
	eatmsc = 0
	private emocttime = 0
	private emn = 0
	private emmask = 0
	private readonly emfield: number[] = new Array<number>(150).fill(0)

	digonscr = false
	private notfiring = false
	bonusvisible = false
	bonusmode = false
	private diggervisible = false

	constructor(w: World) {
		this.w = w
	}

	checkdiggerunderbag(h: number, v: number): boolean {
		if (this.digmdir == 2 || this.digmdir == 6)
			if (Math.floor((this.diggerx - 12) / 20) == h)
				if (Math.floor((this.diggery - 18) / 18) == v || Math.floor((this.diggery - 18) / 18) + 1 == v) return true
		return false
	}

	countem(): number {
		let n = 0
		for (let x = 0; x < 15; x++) for (let y = 0; y < 10; y++) if ((this.emfield[y * 15 + x] & this.emmask) != 0) n++
		return n
	}

	createbonus(): void {
		this.bonusvisible = true
		this.w.drawing.drawbonus(292, 18)
	}

	private diggerdie(): void {
		const { bags, drawing, main, sound, monsters } = this.w
		let clbits: number
		switch (this.deathstage) {
			case 1:
				if (bags.bagy(this.deathbag) + 6 > this.diggery) this.diggery = bags.bagy(this.deathbag) + 6
				drawing.drawdigger(15, this.diggerx, this.diggery, false)
				main.incpenalty()
				if (bags.getbagdir(this.deathbag) + 1 == 0) {
					sound.soundddie()
					this.deathtime = 5
					this.deathstage = 2
					this.deathani = 0
					this.diggery -= 6
				}
				break
			case 2:
				if (this.deathtime != 0) {
					this.deathtime--
					break
				}
				if (this.deathani == 0) sound.music(2)
				clbits = drawing.drawdigger(14 - this.deathani, this.diggerx, this.diggery, false)
				main.incpenalty()
				if (this.deathani == 0 && (clbits & 0x3f00) != 0) monsters.killmonsters(clbits)
				if (this.deathani < 4) {
					this.deathani++
					this.deathtime = 2
				} else {
					this.deathstage = 4
					if (sound.getmusicflag()) this.deathtime = 60
					else this.deathtime = 10
				}
				break
			case 3:
				this.deathstage = 5
				this.deathani = 0
				this.deathtime = 0
				break
			case 5:
				if (this.deathani >= 0 && this.deathani <= 6) {
					drawing.drawdigger(15, this.diggerx, this.diggery - deatharc[this.deathani], false)
					if (this.deathani == 6) sound.musicoff()
					main.incpenalty()
					this.deathani++
					if (this.deathani == 1) sound.soundddie()
					if (this.deathani == 7) {
						this.deathtime = 5
						this.deathani = 0
						this.deathstage = 2
					}
				}
				break
			case 4:
				if (this.deathtime != 0) this.deathtime--
				else main.setdead(true)
		}
	}

	dodigger(): void {
		const { drawing, main, sound, cga } = this.w
		if (this.expsn != 0) this.drawexplosion()
		else this.updatefire()
		if (this.diggervisible)
			if (this.digonscr)
				if (this.digtime != 0) {
					drawing.drawdigger(this.digmdir, this.diggerx, this.diggery, this.notfiring && this.rechargetime == 0)
					main.incpenalty()
					this.digtime--
				} else this.updatedigger()
			else this.diggerdie()
		if (this.bonusmode && this.digonscr) {
			if (this.bonustimeleft != 0) {
				this.bonustimeleft--
				if (this.startbonustimeleft != 0 || this.bonustimeleft < 20) {
					if (this.startbonustimeleft) this.startbonustimeleft--
					if ((this.bonustimeleft & 1) != 0) {
						cga.ginten(0)
						sound.soundbonus()
					} else {
						cga.ginten(1)
						sound.soundbonus()
					}
					if (this.startbonustimeleft == 0) {
						sound.music(0)
						sound.soundbonusoff()
						cga.ginten(1)
					}
				}
			} else {
				this.endbonusmode()
				sound.soundbonusoff()
				sound.music(1)
			}
		}
		if (this.bonusmode && !this.digonscr) {
			this.endbonusmode()
			sound.soundbonusoff()
			sound.music(1)
		}
		if (this.emocttime > 0) this.emocttime--
	}

	drawemeralds(): void {
		this.emmask = 1 << this.w.main.getcplayer()
		for (let x = 0; x < 15; x++)
			for (let y = 0; y < 10; y++)
				if ((this.emfield[y * 15 + x] & this.emmask) != 0) this.w.drawing.drawemerald(x * 20 + 12, y * 18 + 21)
	}

	private drawexplosion(): void {
		switch (this.expsn) {
			case 1:
				this.w.sound.soundexplode()
			// falls through
			case 2:
			case 3:
				this.w.drawing.drawfire(this.firex, this.firey, this.expsn)
				this.w.main.incpenalty()
				this.expsn++
				break
			default:
				this.killfire()
				this.expsn = 0
		}
	}

	private endbonusmode(): void {
		this.bonusmode = false
		this.w.cga.ginten(0)
	}

	erasebonus(): void {
		if (this.bonusvisible) {
			this.bonusvisible = false
			this.w.sprites.erasespr(14)
		}
		this.w.cga.ginten(0)
	}

	erasedigger(): void {
		this.w.sprites.erasespr(0)
		this.diggervisible = false
	}

	hitemerald(x: number, y: number, rx: number, ry: number, dir: number): boolean {
		let hit = false
		let r: number
		if (dir < 0 || dir > 6 || (dir & 1) != 0) return hit
		if (dir == 0 && rx != 0) x++
		if (dir == 6 && ry != 0) y++
		if (dir == 0 || dir == 4) r = rx
		else r = ry
		if ((this.emfield[y * 15 + x] & this.emmask) != 0) {
			if (r == embox[dir]) {
				this.w.drawing.drawemerald(x * 20 + 12, y * 18 + 21)
				this.w.main.incpenalty()
			}
			if (r == embox[dir + 1]) {
				this.w.drawing.eraseemerald(x * 20 + 12, y * 18 + 21)
				this.w.main.incpenalty()
				hit = true
				this.emfield[y * 15 + x] &= ~this.emmask
			}
		}
		return hit
	}

	private initbonusmode(): void {
		this.bonusmode = true
		this.erasebonus()
		this.w.cga.ginten(1)
		this.bonustimeleft = 250 - this.w.main.levof10() * 20
		this.startbonustimeleft = 20
		this.eatmsc = 1
	}

	initdigger(): void {
		this.diggerv = 9
		this.digmdir = 4
		this.diggerh = 7
		this.diggerx = this.diggerh * 20 + 12
		this.digdir = 0
		this.diggerrx = 0
		this.diggerry = 0
		this.digtime = 0
		this.digonscr = true
		this.deathstage = 1
		this.diggervisible = true
		this.diggery = this.diggerv * 18 + 18
		this.w.sprites.movedrawspr(0, this.diggerx, this.diggery)
		this.notfiring = true
		this.emocttime = 0
		this.emn = 0
		this.bonusvisible = this.bonusmode = false
		this.w.controls.clearFire()
		this.expsn = 0
		this.rechargetime = 0
	}

	/** Ignored once the grave/dirge stages have started (C's deathstage<2||>4 guard). */
	killdigger(stage: number, bag: number): void {
		if (this.deathstage < 2 || this.deathstage > 4) {
			this.digonscr = false
			this.deathstage = stage
			this.deathbag = bag
		}
	}

	killemerald(x: number, y: number): void {
		if ((this.emfield[y * 15 + x + 15] & this.emmask) != 0) {
			this.emfield[y * 15 + x + 15] &= ~this.emmask
			this.w.drawing.eraseemerald(x * 20 + 12, (y + 1) * 18 + 21)
		}
	}

	killfire(): void {
		if (!this.notfiring) {
			this.notfiring = true
			this.w.sprites.erasespr(15)
			this.w.sound.soundfireoff()
		}
	}

	makeemfield(): void {
		const main = this.w.main
		this.emmask = 1 << main.getcplayer()
		for (let x = 0; x < 15; x++)
			for (let y = 0; y < 10; y++)
				if (main.getlevch(x, y, main.levplan()) == 'C') this.emfield[y * 15 + x] |= this.emmask
				else this.emfield[y * 15 + x] &= ~this.emmask
	}

	private updatedigger(): void {
		const { controls, drawing, main, bags, monsters, scores, sound } = this.w
		let ddir: number
		let clbits: number
		let push = false
		controls.readdir()
		const dir = controls.getdir()
		if (dir == 0 || dir == 2 || dir == 4 || dir == 6) ddir = dir
		else ddir = -1
		if (this.diggerrx == 0 && (ddir == 2 || ddir == 6)) this.digdir = this.digmdir = ddir
		if (this.diggerry == 0 && (ddir == 4 || ddir == 0)) this.digdir = this.digmdir = ddir
		if (dir == -1) this.digmdir = -1
		else this.digmdir = this.digdir
		if (
			(this.diggerx == 292 && this.digmdir == 0) ||
			(this.diggerx == 12 && this.digmdir == 4) ||
			(this.diggery == 180 && this.digmdir == 6) ||
			(this.diggery == 18 && this.digmdir == 2)
		)
			this.digmdir = -1
		const diggerox = this.diggerx
		const diggeroy = this.diggery
		if (this.digmdir != -1) drawing.eatfield(diggerox, diggeroy, this.digmdir)
		switch (this.digmdir) {
			case 0:
				drawing.drawrightblob(this.diggerx, this.diggery)
				this.diggerx += 4
				break
			case 4:
				drawing.drawleftblob(this.diggerx, this.diggery)
				this.diggerx -= 4
				break
			case 2:
				drawing.drawtopblob(this.diggerx, this.diggery)
				this.diggery -= 3
				break
			case 6:
				drawing.drawbottomblob(this.diggerx, this.diggery)
				this.diggery += 3
				break
		}
		if (
			this.hitemerald(
				Math.floor((this.diggerx - 12) / 20),
				Math.floor((this.diggery - 18) / 18),
				(this.diggerx - 12) % 20,
				(this.diggery - 18) % 18,
				this.digmdir,
			)
		) {
			if (this.emocttime == 0) this.emn = 0
			scores.scoreemerald()
			sound.soundem()
			sound.soundemerald(this.emn)
			this.emn++
			if (this.emn == 8) {
				this.emn = 0
				scores.scoreoctave()
			}
			this.emocttime = 9
		}
		clbits = drawing.drawdigger(this.digdir, this.diggerx, this.diggery, this.notfiring && this.rechargetime == 0)
		main.incpenalty()
		if ((bags.bagbits() & clbits) != 0) {
			if (this.digmdir == 0 || this.digmdir == 4) {
				push = bags.pushbags(this.digmdir, clbits)
				this.digtime++
			} else if (!bags.pushudbags(clbits)) push = false
			if (!push) {
				/* Strange, push not completely defined */
				this.diggerx = diggerox
				this.diggery = diggeroy
				drawing.drawdigger(this.digmdir, this.diggerx, this.diggery, this.notfiring && this.rechargetime == 0)
				main.incpenalty()
				this.digdir = reversedir(this.digmdir)
			}
		}
		if ((clbits & 0x3f00) != 0 && this.bonusmode)
			for (let nmon = monsters.killmonsters(clbits); nmon != 0; nmon--) {
				sound.soundeatm()
				scores.scoreeatm()
			}
		if ((clbits & 0x4000) != 0) {
			scores.scorebonus()
			this.initbonusmode()
		}
		this.diggerh = Math.floor((this.diggerx - 12) / 20)
		this.diggerrx = (this.diggerx - 12) % 20
		this.diggerv = Math.floor((this.diggery - 18) / 18)
		this.diggerry = (this.diggery - 18) % 18
	}

	private updatefire(): void {
		const { controls, drawing, main, sound, sprites, monsters, scores, cga } = this.w
		let clbits: number
		let pix = 0
		if (this.notfiring) {
			if (this.rechargetime != 0) this.rechargetime--
			else if (controls.getfirepflag())
				if (this.digonscr) {
					this.rechargetime = main.levof10() * 3 + 60
					this.notfiring = false
					switch (this.digdir) {
						case 0:
							this.firex = this.diggerx + 8
							this.firey = this.diggery + 4
							break
						case 4:
							this.firex = this.diggerx
							this.firey = this.diggery + 4
							break
						case 2:
							this.firex = this.diggerx + 4
							this.firey = this.diggery
							break
						case 6:
							this.firex = this.diggerx + 4
							this.firey = this.diggery + 8
					}
					this.firedir = this.digdir
					sprites.movedrawspr(15, this.firex, this.firey)
					sound.soundfire()
				}
		} else {
			switch (this.firedir) {
				case 0:
					this.firex += 8
					pix = cga.ggetpix(this.firex, this.firey + 4) | cga.ggetpix(this.firex + 4, this.firey + 4)
					break
				case 4:
					this.firex -= 8
					pix = cga.ggetpix(this.firex, this.firey + 4) | cga.ggetpix(this.firex + 4, this.firey + 4)
					break
				case 2:
					this.firey -= 7
					pix = 0
					for (let i = 0; i < 7; i++) pix |= cga.ggetpix(this.firex + 4, this.firey + i)
					pix &= 0xc0
					break
				case 6:
					this.firey += 7
					pix = 0
					for (let i = 0; i < 7; i++) pix |= cga.ggetpix(this.firex, this.firey + i)
					pix &= 3
					break
			}
			clbits = drawing.drawfire(this.firex, this.firey, 0)
			main.incpenalty()
			if ((clbits & 0x3f00) != 0)
				for (let mon = 0, b = 256; mon < 6; mon++, b <<= 1)
					if ((clbits & b) != 0) {
						monsters.killmon(mon)
						scores.scorekill()
						this.expsn = 1
					}
			if ((clbits & 0x40fe) != 0) this.expsn = 1
			switch (this.firedir) {
				case 0:
					if (this.firex > 296) this.expsn = 1
					else if (pix != 0 && clbits == 0) {
						this.expsn = 1
						this.firex -= 8
						drawing.drawfire(this.firex, this.firey, 0)
					}
					break
				case 4:
					if (this.firex < 16) this.expsn = 1
					else if (pix != 0 && clbits == 0) {
						this.expsn = 1
						this.firex += 8
						drawing.drawfire(this.firex, this.firey, 0)
					}
					break
				case 2:
					if (this.firey < 15) this.expsn = 1
					else if (pix != 0 && clbits == 0) {
						this.expsn = 1
						this.firey += 7
						drawing.drawfire(this.firex, this.firey, 0)
					}
					break
				case 6:
					if (this.firey > 183) this.expsn = 1
					else if (pix != 0 && clbits == 0) {
						this.expsn = 1
						this.firey -= 7
						drawing.drawfire(this.firex, this.firey, 0)
					}
			}
		}
	}
}
