/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Input.js. The DOM side lives in host/keyboard.ts; intents are folded
 * here in arrival order at the start of each tick, which reproduces processkey(): a tap that is
 * pressed and released between two readdir() calls still moves the digger once (staticdir),
 * and releasing one arrow falls back to another held one (setdirec).
 */

import type { Intent } from './types'

export class Controls {
	private leftpressed = false
	private rightpressed = false
	private uppressed = false
	private downpressed = false
	private f1pressed = false
	private firepressed = false
	private dynamicdir = -1
	private staticdir = -1
	private keydir = 0
	private firepflag = false
	/** C's pausef: latched until a live tick takes it. */
	private pausef = false

	apply(intent: Intent): void {
		switch (intent.type) {
			case 'Move':
				switch (intent.dir) {
					case 0:
						if (intent.held) this.Key_rightpressed()
						else this.Key_rightreleased()
						break
					case 2:
						if (intent.held) this.Key_uppressed()
						else this.Key_upreleased()
						break
					case 4:
						if (intent.held) this.Key_leftpressed()
						else this.Key_leftreleased()
						break
					case 6:
						if (intent.held) this.Key_downpressed()
						else this.Key_downreleased()
						break
				}
				break
			case 'Fire':
				if (intent.held) this.Key_f1pressed()
				else this.Key_f1released()
				break
			case 'Pause':
				this.pausef = true
				break
		}
	}

	detectjoy(): void {
		this.staticdir = this.dynamicdir = -1
	}

	getdir(): number {
		return this.keydir
	}

	getfirepflag(): boolean {
		return this.firepflag
	}

	/** Input.firepressed_w(false), called by initdigger(). */
	clearFire(): void {
		this.firepressed = false
	}

	takePause(): boolean {
		const p = this.pausef
		this.pausef = false
		return p
	}

	readdir(): void {
		this.keydir = this.staticdir
		if (this.dynamicdir != -1) this.keydir = this.dynamicdir
		this.staticdir = -1
		if (this.f1pressed || this.firepressed) this.firepflag = true
		else this.firepflag = false
		this.firepressed = false
	}

	private setdirec(): void {
		this.dynamicdir = -1
		if (this.uppressed) this.dynamicdir = this.staticdir = 2
		if (this.downpressed) this.dynamicdir = this.staticdir = 6
		if (this.leftpressed) this.dynamicdir = this.staticdir = 4
		if (this.rightpressed) this.dynamicdir = this.staticdir = 0
	}

	private Key_downpressed(): void {
		this.downpressed = true
		this.dynamicdir = this.staticdir = 6
	}
	private Key_downreleased(): void {
		this.downpressed = false
		if (this.dynamicdir == 6) this.setdirec()
	}
	private Key_f1pressed(): void {
		this.firepressed = true
		this.f1pressed = true
	}
	private Key_f1released(): void {
		this.f1pressed = false
	}
	private Key_leftpressed(): void {
		this.leftpressed = true
		this.dynamicdir = this.staticdir = 4
	}
	private Key_leftreleased(): void {
		this.leftpressed = false
		if (this.dynamicdir == 4) this.setdirec()
	}
	private Key_rightpressed(): void {
		this.rightpressed = true
		this.dynamicdir = this.staticdir = 0
	}
	private Key_rightreleased(): void {
		this.rightpressed = false
		if (this.dynamicdir == 0) this.setdirec()
	}
	private Key_uppressed(): void {
		this.uppressed = true
		this.dynamicdir = this.staticdir = 2
	}
	private Key_upreleased(): void {
		this.uppressed = false
		if (this.dynamicdir == 2) this.setdirec()
	}
}
