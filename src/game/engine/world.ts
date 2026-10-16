/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * One game's module graph. It replaces Futrega's globals: modules hold `w` and call
 * w.bags.pushbags(...) where Futrega called Bags.pushbags(...), in the same order.
 */

import type { HiScoreStore } from '../host/hiscore-store'
import { Cga } from '../pc/cga'
import { Bags } from './bags'
import { Controls } from './controls'
import { Digger } from './digger'
import { Drawing } from './drawing'
import { Main } from './main'
import { Monsters } from './monster'
import { Scores } from './scores'
import { SoundBus } from './sound-bus'
import { Sprites } from './sprite'

export interface EngineDeps {
	/** Seeds Main.randno once per engine. */
	readonly seed: number
	readonly hiscores: HiScoreStore
}

export class World {
	readonly cga: Cga
	readonly sound: SoundBus
	readonly controls: Controls
	readonly hiscores: HiScoreStore
	readonly main: Main
	readonly sprites: Sprites
	readonly drawing: Drawing
	readonly digger: Digger
	readonly monsters: Monsters
	readonly bags: Bags
	readonly scores: Scores

	constructor(deps: EngineDeps) {
		this.cga = new Cga()
		this.sound = new SoundBus()
		this.controls = new Controls()
		this.hiscores = deps.hiscores
		this.main = new Main(this, deps.seed)
		this.sprites = new Sprites(this)
		this.drawing = new Drawing(this)
		this.digger = new Digger(this)
		this.monsters = new Monsters(this)
		this.bags = new Bags(this)
		this.scores = new Scores(this)
	}
}
