/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Monster.js. nob = nobbin (follows tunnels), !nob = hobbin (digs).
 * death 1 = squashed under a falling bag, 4 = about to disappear.
 */

import { reversedir } from './types'
import type { World } from './world'

class MonsterData {
	x = 0
	y = 0
	h = 0
	v = 0
	xr = 0
	yr = 0
	dir = 0
	hdir = 0
	t = 0
	hnt = 0
	death = 0
	bag = 0
	dtime = 0
	stime = 0
	flag = false
	nob = false
	alive = false
}

export class Monsters {
	private readonly w: World
	private readonly mondat = Array.from({ length: 6 }, () => new MonsterData())
	private nextmonster = 0
	private totalmonsters = 0
	private maxmononscr = 0
	private nextmontime = 0
	private mongaptime = 0
	private unbonusflag = false
	private mongotgold = false

	constructor(w: World) {
		this.w = w
	}

	private checkcoincide(mon: number, bits: number): void {
		const mondat = this.mondat
		for (let m = 0, b = 256; m < 6; m++, b <<= 1)
			if ((bits & b) != 0 && mondat[mon].dir == mondat[m].dir && mondat[m].stime == 0 && mondat[mon].stime == 0)
				mondat[m].dir = reversedir(mondat[m].dir)
	}

	checkmonscared(h: number): void {
		for (let m = 0; m < 6; m++) if (h == this.mondat[m].h && this.mondat[m].dir == 2) this.mondat[m].dir = 6
	}

	private createmonster(): void {
		const mondat = this.mondat
		for (let i = 0; i < 6; i++)
			if (!mondat[i].flag) {
				mondat[i].flag = true
				mondat[i].alive = true
				mondat[i].t = 0
				mondat[i].nob = true
				mondat[i].hnt = 0
				mondat[i].h = 14
				mondat[i].v = 0
				mondat[i].x = 292
				mondat[i].y = 18
				mondat[i].xr = 0
				mondat[i].yr = 0
				mondat[i].dir = 4
				mondat[i].hdir = 4
				this.nextmonster++
				this.nextmontime = this.mongaptime
				mondat[i].stime = 5
				this.w.sprites.movedrawspr(i + 8, mondat[i].x, mondat[i].y)
				break
			}
	}

	domonsters(): void {
		const { digger, main } = this.w
		const mondat = this.mondat
		if (this.nextmontime > 0) this.nextmontime--
		else {
			if (this.nextmonster < this.totalmonsters && this.nmononscr() < this.maxmononscr && digger.digonscr && !digger.bonusmode)
				this.createmonster()
			if (this.unbonusflag && this.nextmonster == this.totalmonsters && this.nextmontime == 0)
				if (digger.digonscr) {
					this.unbonusflag = false
					digger.createbonus()
				}
		}
		for (let i = 0; i < 6; i++)
			if (mondat[i].flag) {
				if (mondat[i].hnt > 10 - main.levof10()) {
					if (mondat[i].nob) {
						mondat[i].nob = false
						mondat[i].hnt = 0
					}
				}
				if (mondat[i].alive)
					if (mondat[i].t == 0) {
						this.monai(i)
						if (main.randno(15 - main.levof10()) == 0 && mondat[i].nob) this.monai(i)
					} else mondat[i].t--
				else this.mondie(i)
			}
	}

	erasemonsters(): void {
		for (let i = 0; i < 6; i++) if (this.mondat[i].flag) this.w.sprites.erasespr(i + 8)
	}

	private fieldclear(dir: number, x: number, y: number): boolean {
		switch (dir) {
			case 0:
				if (x < 14)
					if ((this.getfield(x + 1, y) & 0x2000) == 0)
						if ((this.getfield(x + 1, y) & 1) == 0 || (this.getfield(x, y) & 0x10) == 0) return true
				break
			case 4:
				if (x > 0)
					if ((this.getfield(x - 1, y) & 0x2000) == 0)
						if ((this.getfield(x - 1, y) & 0x10) == 0 || (this.getfield(x, y) & 1) == 0) return true
				break
			case 2:
				if (y > 0)
					if ((this.getfield(x, y - 1) & 0x2000) == 0)
						if ((this.getfield(x, y - 1) & 0x800) == 0 || (this.getfield(x, y) & 0x40) == 0) return true
				break
			case 6:
				if (y < 9)
					if ((this.getfield(x, y + 1) & 0x2000) == 0)
						if ((this.getfield(x, y + 1) & 0x40) == 0 || (this.getfield(x, y) & 0x800) == 0) return true
		}
		return false
	}

	getfield(x: number, y: number): number {
		return this.w.drawing.field[y * 15 + x]
	}

	incmont(n: number): void {
		if (n > 6) n = 6
		for (let m = 1; m < n; m++) this.mondat[m].t++
	}

	/** b is shifted twice per pass in the original; kept, since it decides the throttle. */
	private incpenalties(bits: number): void {
		for (let m = 0, b = 256; m < 6; m++, b <<= 1) {
			if ((bits & b) != 0) this.w.main.incpenalty()
			b <<= 1
		}
	}

	initmonsters(): void {
		const main = this.w.main
		for (let i = 0; i < 6; i++) this.mondat[i].flag = false
		this.nextmonster = 0
		this.mongaptime = 45 - (main.levof10() << 1)
		this.totalmonsters = main.levof10() + 5
		switch (main.levof10()) {
			case 1:
				this.maxmononscr = 3
				break
			case 2:
			case 3:
			case 4:
			case 5:
			case 6:
			case 7:
				this.maxmononscr = 4
				break
			case 8:
			case 9:
			case 10:
				this.maxmononscr = 5
		}
		this.nextmontime = 10
		this.unbonusflag = true
	}

	killmon(mon: number): void {
		const m = this.mondat[mon]
		if (m.flag) {
			m.flag = m.alive = false
			this.w.sprites.erasespr(mon + 8)
			if (this.w.digger.bonusmode) this.totalmonsters++
		}
	}

	killmonsters(bits: number): number {
		let n = 0
		for (let m = 0, b = 256; m < 6; m++, b <<= 1)
			if ((bits & b) != 0) {
				this.killmon(m)
				n++
			}
		return n
	}

	private monai(mon: number): void {
		const { digger, main, drawing, bags, scores, sound } = this.w
		const m = this.mondat[mon]
		let clbits: number
		let dir = 0
		let mdirp1 = 0
		let mdirp2 = 0
		let mdirp3 = 0
		let mdirp4 = 0
		let t: number
		let push: boolean
		const monox = m.x
		const monoy = m.y
		if (m.xr == 0 && m.yr == 0) {
			/* If we are here the monster needs to know which way to turn next. */

			/* Turn hobbin back into nobbin if it's had its time */

			if (m.hnt > 30 + (main.levof10() << 1))
				if (!m.nob) {
					m.hnt = 0
					m.nob = true
				}

			/* Set up monster direction properties to chase dig */

			if (Math.abs(digger.diggery - m.y) > Math.abs(digger.diggerx - m.x)) {
				if (digger.diggery < m.y) {
					mdirp1 = 2
					mdirp4 = 6
				} else {
					mdirp1 = 6
					mdirp4 = 2
				}
				if (digger.diggerx < m.x) {
					mdirp2 = 4
					mdirp3 = 0
				} else {
					mdirp2 = 0
					mdirp3 = 4
				}
			} else {
				if (digger.diggerx < m.x) {
					mdirp1 = 4
					mdirp4 = 0
				} else {
					mdirp1 = 0
					mdirp4 = 4
				}
				if (digger.diggery < m.y) {
					mdirp2 = 2
					mdirp3 = 6
				} else {
					mdirp2 = 6
					mdirp3 = 2
				}
			}

			/* In bonus mode, run away from digger */

			if (digger.bonusmode) {
				t = mdirp1
				mdirp1 = mdirp4
				mdirp4 = t
				t = mdirp2
				mdirp2 = mdirp3
				mdirp3 = t
			}

			/* Adjust priorities so that monsters don't reverse direction unless they
			   really have to */

			dir = reversedir(m.dir)
			if (dir == mdirp1) {
				mdirp1 = mdirp2
				mdirp2 = mdirp3
				mdirp3 = mdirp4
				mdirp4 = dir
			}
			if (dir == mdirp2) {
				mdirp2 = mdirp3
				mdirp3 = mdirp4
				mdirp4 = dir
			}
			if (dir == mdirp3) {
				mdirp3 = mdirp4
				mdirp4 = dir
			}

			/* Introduce a randno element on levels <6 : occasionally swap p1 and p3 */

			if (main.randno(main.levof10() + 5) == 1 && main.levof10() < 6) {
				t = mdirp1
				mdirp1 = mdirp3
				mdirp3 = t
			}

			/* Check field and find direction */

			if (this.fieldclear(mdirp1, m.h, m.v)) dir = mdirp1
			else if (this.fieldclear(mdirp2, m.h, m.v)) dir = mdirp2
			else if (this.fieldclear(mdirp3, m.h, m.v)) dir = mdirp3
			else if (this.fieldclear(mdirp4, m.h, m.v)) dir = mdirp4

			/* Hobbins don't care about the field: they go where they want. */

			if (!m.nob) dir = mdirp1

			/* Monsters take a time penalty for changing direction */

			if (m.dir != dir) m.t++

			/* Save the new direction */

			m.dir = dir
		}

		/* If monster is about to go off edge of screen, stop it. */

		if ((m.x == 292 && m.dir == 0) || (m.x == 12 && m.dir == 4) || (m.y == 180 && m.dir == 6) || (m.y == 18 && m.dir == 2))
			m.dir = -1

		/* Change hdir for hobbin */

		if (m.dir == 4 || m.dir == 0) m.hdir = m.dir

		/* Hobbins digger */

		if (!m.nob) drawing.eatfield(m.x, m.y, m.dir)

		/* (Draw new tunnels) and move monster */

		switch (m.dir) {
			case 0:
				if (!m.nob) drawing.drawrightblob(m.x, m.y)
				m.x += 4
				break
			case 4:
				if (!m.nob) drawing.drawleftblob(m.x, m.y)
				m.x -= 4
				break
			case 2:
				if (!m.nob) drawing.drawtopblob(m.x, m.y)
				m.y -= 3
				break
			case 6:
				if (!m.nob) drawing.drawbottomblob(m.x, m.y)
				m.y += 3
				break
		}

		/* Hobbins can eat emeralds */

		if (!m.nob) digger.hitemerald(Math.floor((m.x - 12) / 20), Math.floor((m.y - 18) / 18), (m.x - 12) % 20, (m.y - 18) % 18, m.dir)

		/* If digger's gone, don't bother */

		if (!digger.digonscr) {
			m.x = monox
			m.y = monoy
		}

		/* If monster's just started, don't move yet */

		if (m.stime != 0) {
			m.stime--
			m.x = monox
			m.y = monoy
		}

		/* Increase time counter for hobbin */

		if (!m.nob && m.hnt < 100) m.hnt++

		/* Draw monster */

		push = true
		clbits = drawing.drawmon(mon, m.nob, m.hdir, m.x, m.y)
		main.incpenalty()

		/* Collision with another monster */

		if ((clbits & 0x3f00) != 0) {
			m.t++ /* Time penalty */
			this.checkcoincide(mon, clbits) /* Ensure both aren't moving in the same dir. */
			this.incpenalties(clbits)
		}

		/* Check for collision with bag */

		if ((clbits & bags.bagbits()) != 0) {
			m.t++ /* Time penalty */
			this.mongotgold = false
			if (m.dir == 4 || m.dir == 0) {
				/* Horizontal push */
				push = bags.pushbags(m.dir, clbits)
				m.t++ /* Time penalty */
			} else if (!bags.pushudbags(clbits)) /* Vertical push */ push = false
			if (this.mongotgold) /* No time penalty if monster eats gold */ m.t = 0
			if (!m.nob && m.hnt > 1) bags.removebags(clbits) /* Hobbins eat bags */
		}

		/* Increase hobbin cross counter */

		if (m.nob && (clbits & 0x3f00) != 0 && digger.digonscr) m.hnt++

		/* See if bags push monster back */

		if (!push) {
			m.x = monox
			m.y = monoy
			drawing.drawmon(mon, m.nob, m.hdir, m.x, m.y)
			main.incpenalty()
			if (m.nob) /* The other way to create hobbin: stuck on h-bag */ m.hnt++
			if ((m.dir == 2 || m.dir == 6) && m.nob) m.dir = reversedir(m.dir) /* If vertical, give up */
		}

		/* Collision with digger */

		if ((clbits & 1) != 0 && digger.digonscr)
			if (digger.bonusmode) {
				this.killmon(mon)
				scores.scoreeatm()
				sound.soundeatm() /* Collision in bonus mode */
			} else digger.killdigger(3, 0) /* Kill digger */

		/* Update co-ordinates */

		m.h = Math.floor((m.x - 12) / 20)
		m.v = Math.floor((m.y - 18) / 18)
		m.xr = (m.x - 12) % 20
		m.yr = (m.y - 18) % 18
	}

	private mondie(mon: number): void {
		const { bags, drawing, main, scores } = this.w
		const m = this.mondat[mon]
		switch (m.death) {
			case 1:
				if (bags.bagy(m.bag) + 6 > m.y) m.y = bags.bagy(m.bag)
				drawing.drawmondie(mon, m.nob, m.hdir, m.x, m.y)
				main.incpenalty()
				if (bags.getbagdir(m.bag) == -1) {
					m.dtime = 1
					m.death = 4
				}
				break
			case 4:
				if (m.dtime != 0) m.dtime--
				else {
					this.killmon(mon)
					scores.scorekill()
				}
		}
	}

	mongold(): void {
		this.mongotgold = true
	}

	monleft(): number {
		return this.nmononscr() + this.totalmonsters - this.nextmonster
	}

	private nmononscr(): number {
		let n = 0
		for (let i = 0; i < 6; i++) if (this.mondat[i].flag) n++
		return n
	}

	private squashmonster(mon: number, death: number, bag: number): void {
		this.mondat[mon].alive = false
		this.mondat[mon].death = death
		this.mondat[mon].bag = bag
	}

	squashmonsters(bag: number, bits: number): void {
		for (let m = 0, b = 256; m < 6; m++, b <<= 1)
			if ((bits & b) != 0) if (this.mondat[m].y >= this.w.bags.bagy(bag)) this.squashmonster(m, 1, bag)
	}
}
