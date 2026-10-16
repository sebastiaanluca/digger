/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 */

import type { PresentedFrame } from '../pc/cga'
import { enterTitle, step, type Session } from './session'
import type { SoundCue } from './sound-bus'
import type { Intent } from './types'
import { World, type EngineDeps } from './world'

/** Owns the World and the Session. tick() is the only code that mutates game state. */
export class Engine {
	private readonly w: World
	private session: Session

	constructor(deps: EngineDeps) {
		this.w = new World(deps)
		this.session = enterTitle(this.w)
	}

	get phase(): Session['phase'] {
		return this.session.phase
	}

	tick(intents: readonly Intent[]): void {
		for (const i of intents) this.w.controls.apply(i)
		this.session = step(this.session, this.w, intents)
	}

	frame(): PresentedFrame {
		return this.w.cga.present()
	}

	takeSoundCues(): readonly SoundCue[] {
		return this.w.sound.take()
	}
}
