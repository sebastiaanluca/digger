/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * The rules call these methods exactly where Futrega called Sound.*(). Each call becomes a cue
 * for the audio worklet, which owns all sound state; the engine never reads sound state back.
 */

/** 0 bonus jingle, 1 background (Popcorn), 2 dirge. */
export type Tune = 0 | 1 | 2

export type SimpleCue =
	| 'musicOff'
	| 'stop'
	| 'kill'
	| 'setup'
	| 'pause'
	| 'resume'
	| 'oneUp'
	| 'bonus'
	| 'bonusOff'
	| 'break'
	| 'diggerDie'
	| 'eatMonster'
	| 'em'
	| 'explode'
	| 'fall'
	| 'fallOff'
	| 'fire'
	| 'fireOff'
	| 'gold'
	| 'wobble'
	| 'wobbleOff'
	| 'levelDone'

export type SoundCue =
	| { readonly cue: 'music'; readonly tune: Tune }
	| { readonly cue: 'emerald'; readonly note: number }
	| { readonly cue: SimpleCue }

export interface SpeakerMessage {
	readonly cues: readonly SoundCue[]
}

export class SoundBus {
	private cues: SoundCue[] = []

	take(): readonly SoundCue[] {
		const out = this.cues
		this.cues = []
		return out
	}

	private simple(cue: SimpleCue): void {
		this.cues.push({ cue })
	}

	/** F7 (music toggle) is not offered, so music is always on. */
	getmusicflag(): boolean {
		return true
	}

	music(tune: Tune): void {
		this.cues.push({ cue: 'music', tune })
	}
	soundemerald(note: number): void {
		this.cues.push({ cue: 'emerald', note })
	}
	musicoff(): void {
		this.simple('musicOff')
	}
	soundstop(): void {
		this.simple('stop')
	}
	killsound(): void {
		this.simple('kill')
	}
	setupsound(): void {
		this.simple('setup')
	}
	/** Main.testpause: soundpause() + sett2val(40) + setsoundt2(). */
	soundpause(): void {
		this.simple('pause')
	}
	soundpauseoff(): void {
		this.simple('resume')
	}
	sound1up(): void {
		this.simple('oneUp')
	}
	soundbonus(): void {
		this.simple('bonus')
	}
	soundbonusoff(): void {
		this.simple('bonusOff')
	}
	soundbreak(): void {
		this.simple('break')
	}
	soundddie(): void {
		this.simple('diggerDie')
	}
	soundeatm(): void {
		this.simple('eatMonster')
	}
	soundem(): void {
		this.simple('em')
	}
	soundexplode(): void {
		this.simple('explode')
	}
	soundfall(): void {
		this.simple('fall')
	}
	soundfalloff(): void {
		this.simple('fallOff')
	}
	soundfire(): void {
		this.simple('fire')
	}
	soundfireoff(): void {
		this.simple('fireOff')
	}
	soundgold(): void {
		this.simple('gold')
	}
	soundwobble(): void {
		this.simple('wobble')
	}
	soundwobbleoff(): void {
		this.simple('wobbleOff')
	}
	/** Sound.soundlevdone; the engine waits LEVEL_DONE_TICKS instead of blocking on it. */
	soundlevdone(): void {
		this.simple('levelDone')
	}
}
