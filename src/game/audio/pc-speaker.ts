/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Sound.js (itself newsnd/newsnd2.c): the music sequencer, the effect
 * flags and the 8253 PIT + PC speaker emulation. Each output sample advances timer 0; every
 * timer overflow at 0x4000 (~72.8 Hz) runs soundint(), as the timer interrupt did.
 *
 * DOM-free so it runs inside the AudioWorklet, or on the main thread as a fallback.
 */

import type { SoundCue } from '../engine/sound-bus'

const PIT_HZ = 0x1234dd
const MIN_SAMP = -0.3
const MAX_SAMP = 0.3

const newlevjingle = [0x8e8, 0x712, 0x5f2, 0x7f0, 0x6ac, 0x54c, 0x712, 0x5f2, 0x4b8, 0x474, 0x474]
const emfreqs = [0x8e8, 0x7f0, 0x712, 0x6ac, 0x5f2, 0x54c, 0x4b8, 0x474]

const bonusjingle = [
0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,
0xd59,4, 0xbe4,4, 0xa98,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,
0x11d1,4, 0xd59,2, 0xa98,2, 0xbe4,4, 0xe24,4,0x11d1,4,0x11d1,2,0x11d1,2,
0x11d1,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2, 0xd59,4, 0xbe4,4,
0xa98,4, 0xd59,2, 0xa98,2, 0x8e8,10,0xa00,2, 0xa98,2, 0xbe4,2, 0xd59,4,
0xa98,4, 0xd59,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,0x11d1,4,
0x11d1,2,0x11d1,2, 0xd59,4, 0xbe4,4, 0xa98,4,0x11d1,2,0x11d1,2,0x11d1,4,
0x11d1,2,0x11d1,2,0x11d1,4, 0xd59,2, 0xa98,2, 0xbe4,4, 0xe24,4,0x11d1,4,
0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,0x11d1,4,0x11d1,2,0x11d1,2,
0xd59,4, 0xbe4,4, 0xa98,4, 0xd59,2, 0xa98,2, 0x8e8,10,0xa00,2, 0xa98,2,
0xbe4,2, 0xd59,4, 0xa98,4, 0xd59,4, 0xa98,2, 0xa98,2, 0xa98,4, 0xa98,2,
0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4, 0x7f0,4, 0xa98,4, 0x7f0,4,
0xa98,4, 0x7f0,4, 0xa98,4, 0xbe4,4, 0xd59,4, 0xe24,4, 0xfdf,4, 0xa98,2,
0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4,
0x7f0,4, 0xa98,4, 0x7f0,4, 0xa98,4, 0x7f0,4, 0x8e8,4, 0x970,4, 0x8e8,4,
0x970,4, 0x8e8,4, 0xa98,2, 0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4,
0xa98,2, 0xa98,2, 0xa98,4, 0x7f0,4, 0xa98,4, 0x7f0,4, 0xa98,4, 0x7f0,4,
0xa98,4, 0xbe4,4, 0xd59,4, 0xe24,4, 0xfdf,4, 0xa98,2, 0xa98,2, 0xa98,4,
0xa98,2, 0xa98,2, 0xa98,4, 0xa98,2, 0xa98,2, 0xa98,4, 0x7f0,4, 0xa98,4,
0x7f0,4, 0xa98,4, 0x7f0,4, 0x8e8,4, 0x970,4, 0x8e8,4, 0x970,4, 0x8e8,4,
0x7d64 ]

/** Popcorn. */
const backgjingle = [
0xfdf,2,0x11d1,2, 0xfdf,2,0x1530,2,0x1ab2,2,0x1530,2,0x1fbf,4, 0xfdf,2,
0x11d1,2, 0xfdf,2,0x1530,2,0x1ab2,2,0x1530,2,0x1fbf,4, 0xfdf,2, 0xe24,2,
0xd59,2, 0xe24,2, 0xd59,2, 0xfdf,2, 0xe24,2, 0xfdf,2, 0xe24,2,0x11d1,2,
0xfdf,2,0x11d1,2, 0xfdf,2,0x1400,2, 0xfdf,4, 0xfdf,2,0x11d1,2, 0xfdf,2,
0x1530,2,0x1ab2,2,0x1530,2,0x1fbf,4, 0xfdf,2,0x11d1,2, 0xfdf,2,0x1530,2,
0x1ab2,2,0x1530,2,0x1fbf,4, 0xfdf,2, 0xe24,2, 0xd59,2, 0xe24,2, 0xd59,2,
0xfdf,2, 0xe24,2, 0xfdf,2, 0xe24,2,0x11d1,2, 0xfdf,2,0x11d1,2, 0xfdf,2,
0xe24,2, 0xd59,4, 0xa98,2, 0xbe4,2, 0xa98,2, 0xd59,2,0x11d1,2, 0xd59,2,
0x1530,4, 0xa98,2, 0xbe4,2, 0xa98,2, 0xd59,2,0x11d1,2, 0xd59,2,0x1530,4,
0xa98,2, 0x970,2, 0x8e8,2, 0x970,2, 0x8e8,2, 0xa98,2, 0x970,2, 0xa98,2,
0x970,2, 0xbe4,2, 0xa98,2, 0xbe4,2, 0xa98,2, 0xd59,2, 0xa98,4, 0xa98,2,
0xbe4,2, 0xa98,2, 0xd59,2,0x11d1,2, 0xd59,2,0x1530,4, 0xa98,2, 0xbe4,2,
0xa98,2, 0xd59,2,0x11d1,2, 0xd59,2,0x1530,4, 0xa98,2, 0x970,2, 0x8e8,2,
0x970,2, 0x8e8,2, 0xa98,2, 0x970,2, 0xa98,2, 0x970,2, 0xbe4,2, 0xa98,2,
0xbe4,2, 0xa98,2, 0xd59,2, 0xa98,4, 0x7f0,2, 0x8e8,2, 0xa98,2, 0xd59,2,
0x11d1,2, 0xd59,2,0x1530,4, 0xa98,2, 0xbe4,2, 0xa98,2, 0xd59,2,0x11d1,2,
0xd59,2,0x1530,4, 0xa98,2, 0x970,2, 0x8e8,2, 0x970,2, 0x8e8,2, 0xa98,2,
0x970,2, 0xa98,2, 0x970,2, 0xbe4,2, 0xa98,2, 0xbe4,2, 0xd59,2, 0xbe4,2,
0xa98,4,0x7d64 ]

const dirge = [
0x7d00, 2,0x11d1, 6,0x11d1, 4,0x11d1, 2,0x11d1, 6, 0xefb, 4, 0xfdf, 2,
0xfdf, 4,0x11d1, 2,0x11d1, 4,0x12e0, 2,0x11d1,12,0x7d00,16,0x7d00,16,
0x7d00,16,0x7d00,16,0x7d00,16,0x7d00,16,0x7d00,16,0x7d00,16,0x7d00,16,
0x7d00,16,0x7d00,16,0x7d00,16,0x7d64 ]

export class PcSpeaker {
	private wavetype = 0
	private musvol = 0
	private spkrmode = 0
	private timerrate = 0x7d0
	private timercount = 0
	private t2val = 0
	private t0val = 0
	private pulsewidth = 1
	private readonly volume = 1

	private soundflag = true
	private musicflag = true
	private sndflag = false
	private soundpausedflag = false

	private soundlevdoneflag = false
	private nljpointer = 0
	private nljnoteduration = 0

	private soundfallflag = false
	private soundfallf = false
	private soundfallvalue = 0
	private soundfalln = 0

	private soundbreakflag = false
	private soundbreakduration = 0
	private soundbreakvalue = 0

	private soundwobbleflag = false
	private soundwobblen = 0

	private soundfireflag = false
	private soundfirevalue = 0
	private soundfiren = 0

	private soundexplodeflag = false
	private soundexplodevalue = 0
	private soundexplodeduration = 0

	private soundbonusflag = false
	private soundbonusn = 0

	private soundemflag = false

	private soundemeraldflag = false
	private soundemeraldduration = 0
	private emerfreq = 0
	private soundemeraldn = 0

	private soundgoldflag = false
	private soundgoldf = false
	private soundgoldvalue1 = 0
	private soundgoldvalue2 = 0
	private soundgoldduration = 0

	private soundeatmflag = false
	private soundeatmvalue = 0
	private soundeatmduration = 0
	private soundeatmn = 0

	private soundddieflag = false
	private soundddien = 0
	private soundddievalue = 0

	private sound1upflag = false
	private sound1upduration = 0

	private musicplaying = false
	private musicp = 0
	private tuneno = 0
	private noteduration = 0
	private notevalue = 0
	private musicmaxvol = 0
	private musicattackrate = 0
	private musicsustainlevel = 0
	private musicdecayrate = 0
	private musicnotewidth = 0
	private musicreleaserate = 0
	private musicstage = 0
	private musicn = 0

	private soundt0flag = false
	private int8flag = false

	/** PIT ticks per output sample (Futrega truncated this; the fraction keeps the tempo exact). */
	private readonly rate: number
	/** Jenner newsnd.c: soundint, including the level jingle, at round(sampleRate / 72.8). */
	private readonly levdoneEvery: number
	private levdoneCount = 0
	private t0rate = 0
	private t2rate = 0
	private t0v = 0
	private t2v = 0
	private t2sw = false

	/** Fire noise used the game's randno in Futrega, from the audio thread; it has its own here. */
	private randv: number

	constructor(sampleRate: number, seed = 0x2468ace) {
		this.rate = PIT_HZ / sampleRate
		this.levdoneEvery = Math.max(1, Math.round(sampleRate / (PIT_HZ / 0x4000)))
		this.randv = seed & 0x7fffffff
		this.initsound()
	}

	apply(c: SoundCue): void {
		switch (c.cue) {
			case 'music':
				this.music(c.tune)
				break
			case 'emerald':
				this.soundemerald(c.note)
				break
			case 'musicOff':
				this.musicoff()
				break
			case 'stop':
				this.soundstop()
				break
			case 'kill':
				this.killsound()
				break
			case 'setup':
				this.setupsound()
				break
			case 'pause':
				this.soundpause()
				this.sett2val(40)
				this.setsoundt2()
				break
			case 'resume':
				this.soundpauseoff()
				break
			case 'oneUp':
				this.sound1up()
				break
			case 'bonus':
				this.soundbonus()
				break
			case 'bonusOff':
				this.soundbonusoff()
				break
			case 'break':
				this.soundbreak()
				break
			case 'diggerDie':
				this.soundddie()
				break
			case 'eatMonster':
				this.soundeatm()
				break
			case 'em':
				this.soundem()
				break
			case 'explode':
				this.soundexplode()
				break
			case 'fall':
				this.soundfall()
				break
			case 'fallOff':
				this.soundfalloff()
				break
			case 'fire':
				this.soundfire()
				break
			case 'fireOff':
				this.soundfireoff()
				break
			case 'gold':
				this.soundgold()
				break
			case 'wobble':
				this.soundwobble()
				break
			case 'wobbleOff':
				this.soundwobbleoff()
				break
			case 'levelDone':
				this.soundlevdone()
				break
		}
	}

	fill(out: Float32Array): void {
		for (let i = 0; i < out.length; i++) {
			out[i] = this.getsample2()
			if (!this.soundlevdoneflag) {
				this.levdoneCount = 0
				continue
			}
			this.levdoneCount++
			if (this.levdoneCount >= this.levdoneEvery) {
				this.levdoneCount = 0
				this.soundlevdoneupdate()
			}
		}
	}

	private randno(n: number): number {
		this.randv = (Math.imul(this.randv, 0x15a4e35) + 1) & 0x7fffffff
		return this.randv % n
	}

	private initsound(): void {
		this.settimer2(40)
		this.setspkrt2()
		this.settimer0(0)
		this.wavetype = 2
		this.t0val = 12000
		this.musvol = 8
		this.t2val = 40
		this.soundt0flag = true
		this.sndflag = true
		this.spkrmode = 0
		this.int8flag = false
		this.setsoundt2()
		this.soundstop()
		this.setupsound()
		this.timerrate = 0x4000
		this.settimer0(0x4000)
	}

	private music(tune: number): void {
		this.tuneno = tune
		this.musicp = 0
		this.noteduration = 0
		switch (tune) {
			case 0:
				this.musicmaxvol = 50
				this.musicattackrate = 20
				this.musicsustainlevel = 20
				this.musicdecayrate = 10
				this.musicreleaserate = 4
				break
			case 1:
				this.musicmaxvol = 50
				this.musicattackrate = 50
				this.musicsustainlevel = 8
				this.musicdecayrate = 15
				this.musicreleaserate = 1
				break
			case 2:
				this.musicmaxvol = 50
				this.musicattackrate = 50
				this.musicsustainlevel = 25
				this.musicdecayrate = 5
				this.musicreleaserate = 1
		}
		this.musicplaying = true
		if (tune == 2) this.soundddieoff()
	}

	private musicoff(): void {
		this.musicplaying = false
		this.musicp = 0
	}

	private musicupdate(): void {
		if (!this.musicplaying) return
		if (this.noteduration != 0) this.noteduration--
		else {
			this.musicstage = this.musicn = 0
			switch (this.tuneno) {
				case 0:
					this.noteduration = bonusjingle[this.musicp + 1] * 3
					this.musicnotewidth = this.noteduration - 3
					this.notevalue = bonusjingle[this.musicp]
					this.musicp += 2
					if (bonusjingle[this.musicp] == 0x7d64) this.musicp = 0
					break
				case 1:
					this.noteduration = backgjingle[this.musicp + 1] * 6
					this.musicnotewidth = 12
					this.notevalue = backgjingle[this.musicp]
					this.musicp += 2
					if (backgjingle[this.musicp] == 0x7d64) this.musicp = 0
					break
				case 2:
					this.noteduration = dirge[this.musicp + 1] * 10
					this.musicnotewidth = this.noteduration - 10
					this.notevalue = dirge[this.musicp]
					this.musicp += 2
					if (dirge[this.musicp] == 0x7d64) this.musicp = 0
					break
			}
		}
		this.musicn++
		this.wavetype = 1
		this.t0val = this.notevalue
		if (this.musicn >= this.musicnotewidth) this.musicstage = 2
		switch (this.musicstage) {
			case 0:
				if (this.musvol + this.musicattackrate >= this.musicmaxvol) {
					this.musicstage = 1
					this.musvol = this.musicmaxvol
					break
				}
				this.musvol += this.musicattackrate
				break
			case 1:
				if (this.musvol - this.musicdecayrate <= this.musicsustainlevel) {
					this.musvol = this.musicsustainlevel
					break
				}
				this.musvol -= this.musicdecayrate
				break
			case 2:
				if (this.musvol - this.musicreleaserate <= 1) {
					this.musvol = 1
					break
				}
				this.musvol -= this.musicreleaserate
		}
		if (this.musvol == 1) this.t0val = 0x7d00
	}

	private setsoundmode(): void {
		this.spkrmode = this.wavetype
		if (!this.soundt0flag && this.sndflag) {
			this.soundt0flag = true
			this.setspkrt2()
		}
	}

	private setsoundt2(): void {
		if (this.soundt0flag) {
			this.spkrmode = 0
			this.soundt0flag = false
			this.setspkrt2()
		}
	}

	private sett0(): void {
		if (this.sndflag) {
			this.timer2(this.t2val)
			if (this.t0val < 1000 && (this.wavetype == 1 || this.wavetype == 2)) this.t0val = 1000
			this.timer0(this.t0val)
			this.timerrate = this.t0val
			if (this.musvol < 1) this.musvol = 1
			if (this.musvol > 50) this.musvol = 50
			this.pulsewidth = this.musvol * this.volume
			this.setsoundmode()
		}
	}

	private sett2val(t2v: number): void {
		if (this.sndflag) this.timer2(t2v)
	}

	private sound1up(): void {
		this.sound1upduration = 96
		this.sound1upflag = true
	}

	private sound1upoff(): void {
		this.sound1upflag = false
	}

	private sound1upupdate(): void {
		if (this.sound1upflag) {
			if (Math.floor(this.sound1upduration / 3) % 2 != 0) this.t2val = (this.sound1upduration << 2) + 600
			this.sound1upduration--
			if (this.sound1upduration < 1) this.sound1upflag = false
		}
	}

	private soundbonus(): void {
		this.soundbonusflag = true
	}

	private soundbonusoff(): void {
		this.soundbonusflag = false
		this.soundbonusn = 0
	}

	private soundbonusupdate(): void {
		if (this.soundbonusflag) {
			this.soundbonusn++
			if (this.soundbonusn > 15) this.soundbonusn = 0
			if (this.soundbonusn >= 0 && this.soundbonusn < 6) this.t2val = 0x4ce
			if (this.soundbonusn >= 8 && this.soundbonusn < 14) this.t2val = 0x5e9
		}
	}

	private soundbreak(): void {
		this.soundbreakduration = 3
		if (this.soundbreakvalue < 15000) this.soundbreakvalue = 15000
		this.soundbreakflag = true
	}

	private soundbreakoff(): void {
		this.soundbreakflag = false
	}

	private soundbreakupdate(): void {
		if (this.soundbreakflag)
			if (this.soundbreakduration != 0) {
				this.soundbreakduration--
				this.t2val = this.soundbreakvalue
			} else this.soundbreakflag = false
	}

	private soundddie(): void {
		this.soundddien = 0
		this.soundddievalue = 20000
		this.soundddieflag = true
	}

	private soundddieoff(): void {
		this.soundddieflag = false
	}

	private soundddieupdate(): void {
		if (this.soundddieflag) {
			this.soundddien++
			if (this.soundddien == 1) this.musicoff()
			if (this.soundddien >= 1 && this.soundddien <= 10) this.soundddievalue = 20000 - this.soundddien * 1000
			if (this.soundddien > 10) this.soundddievalue += 500
			if (this.soundddievalue > 30000) this.soundddieoff()
			this.t2val = this.soundddievalue
		}
	}

	private soundeatm(): void {
		this.soundeatmduration = 20
		this.soundeatmn = 3
		this.soundeatmvalue = 2000
		this.soundeatmflag = true
	}

	private soundeatmoff(): void {
		this.soundeatmflag = false
	}

	private soundeatmupdate(): void {
		if (this.soundeatmflag)
			if (this.soundeatmn != 0) {
				if (this.soundeatmduration != 0) {
					if (this.soundeatmduration % 4 == 1) this.t2val = this.soundeatmvalue
					if (this.soundeatmduration % 4 == 3) this.t2val = this.soundeatmvalue - (this.soundeatmvalue >> 4)
					this.soundeatmduration--
					this.soundeatmvalue -= this.soundeatmvalue >> 4
				} else {
					this.soundeatmduration = 20
					this.soundeatmn--
					this.soundeatmvalue = 2000
				}
			} else this.soundeatmflag = false
	}

	private soundem(): void {
		this.soundemflag = true
	}

	private soundemerald(n: number): void {
		this.emerfreq = emfreqs[n & 7]
		this.soundemeraldduration = 7
		this.soundemeraldn = 0
		this.soundemeraldflag = true
	}

	private soundemeraldoff(): void {
		this.soundemeraldflag = false
	}

	private soundemeraldupdate(): void {
		if (this.soundemeraldflag)
			if (this.soundemeraldduration != 0) {
				if (this.soundemeraldn == 0 || this.soundemeraldn == 1) this.t2val = this.emerfreq
				this.soundemeraldn++
				if (this.soundemeraldn > 7) {
					this.soundemeraldn = 0
					this.soundemeraldduration--
				}
			} else this.soundemeraldoff()
	}

	private soundemoff(): void {
		this.soundemflag = false
	}

	private soundemupdate(): void {
		if (this.soundemflag) {
			this.t2val = 1000
			this.soundemoff()
		}
	}

	private soundexplode(): void {
		this.soundexplodevalue = 1500
		this.soundexplodeduration = 10
		this.soundexplodeflag = true
		this.soundfireoff()
	}

	private soundexplodeoff(): void {
		this.soundexplodeflag = false
	}

	private soundexplodeupdate(): void {
		if (this.soundexplodeflag)
			if (this.soundexplodeduration != 0) {
				this.soundexplodevalue = this.t2val = this.soundexplodevalue - (this.soundexplodevalue >> 3)
				this.soundexplodeduration--
			} else this.soundexplodeflag = false
	}

	private soundfall(): void {
		this.soundfallvalue = 1000
		this.soundfallflag = true
	}

	private soundfalloff(): void {
		this.soundfallflag = false
		this.soundfalln = 0
	}

	private soundfallupdate(): void {
		if (this.soundfallflag)
			if (this.soundfalln < 1) {
				this.soundfalln++
				if (this.soundfallf) this.t2val = this.soundfallvalue
			} else {
				this.soundfalln = 0
				if (this.soundfallf) {
					this.soundfallvalue += 50
					this.soundfallf = false
				} else this.soundfallf = true
			}
	}

	private soundfire(): void {
		this.soundfirevalue = 500
		this.soundfireflag = true
	}

	private soundfireoff(): void {
		this.soundfireflag = false
		this.soundfiren = 0
	}

	private soundfireupdate(): void {
		if (this.soundfireflag) {
			if (this.soundfiren == 1) {
				this.soundfiren = 0
				this.soundfirevalue += Math.floor(this.soundfirevalue / 55)
				this.t2val = this.soundfirevalue + this.randno(this.soundfirevalue >> 3)
				if (this.soundfirevalue > 30000) this.soundfireoff()
			} else this.soundfiren++
		}
	}

	private soundgold(): void {
		this.soundgoldvalue1 = 500
		this.soundgoldvalue2 = 4000
		this.soundgoldduration = 30
		this.soundgoldf = false
		this.soundgoldflag = true
	}

	private soundgoldoff(): void {
		this.soundgoldflag = false
	}

	private soundgoldupdate(): void {
		if (this.soundgoldflag) {
			if (this.soundgoldduration != 0) this.soundgoldduration--
			else this.soundgoldflag = false
			if (this.soundgoldf) {
				this.soundgoldf = false
				this.t2val = this.soundgoldvalue1
			} else {
				this.soundgoldf = true
				this.t2val = this.soundgoldvalue2
			}
			this.soundgoldvalue1 += this.soundgoldvalue1 >> 4
			this.soundgoldvalue2 -= this.soundgoldvalue2 >> 4
		}
	}

	private soundint(): void {
		if (this.soundflag && !this.sndflag) this.sndflag = this.musicflag = true
		if (!this.soundflag && this.sndflag) {
			this.sndflag = false
			this.timer2(40)
			this.setsoundt2()
			this.soundoff()
		}
		if (this.sndflag && !this.soundpausedflag) {
			this.t0val = 0x7d00
			this.t2val = 40
			if (this.musicflag) this.musicupdate()
			this.soundemeraldupdate()
			this.soundwobbleupdate()
			this.soundddieupdate()
			this.soundbreakupdate()
			this.soundgoldupdate()
			this.soundemupdate()
			this.soundexplodeupdate()
			this.soundfireupdate()
			this.soundeatmupdate()
			this.soundfallupdate()
			this.sound1upupdate()
			this.soundbonusupdate()
			if (this.t0val == 0x7d00 || this.t2val != 40) this.setsoundt2()
			else {
				this.setsoundmode()
				this.sett0()
			}
			this.sett2val(this.t2val)
		}
	}

	private soundlevdone(): void {
		this.soundstop()
		this.nljpointer = 0
		this.nljnoteduration = 20
		this.levdoneCount = 0
		this.soundlevdoneflag = this.soundpausedflag = true
	}

	private soundlevdoneoff(): void {
		this.soundlevdoneflag = this.soundpausedflag = false
	}

	private soundlevdoneupdate(): void {
		if (this.sndflag) {
			if (this.nljpointer < 11) this.t2val = newlevjingle[this.nljpointer]
			this.t0val = this.t2val + 35
			this.musvol = 50
			this.setsoundmode()
			this.sett0()
			this.sett2val(this.t2val)
			if (this.nljnoteduration > 0) this.nljnoteduration--
			else {
				this.nljnoteduration = 20
				this.nljpointer++
				if (this.nljpointer > 10) this.soundlevdoneoff()
			}
		} else this.soundlevdoneflag = false
	}

	private soundpause(): void {
		this.soundpausedflag = true
	}

	private soundpauseoff(): void {
		this.soundpausedflag = false
	}

	private soundstop(): void {
		this.soundfalloff()
		this.soundwobbleoff()
		this.soundfireoff()
		this.musicoff()
		this.soundbonusoff()
		this.soundexplodeoff()
		this.soundbreakoff()
		this.soundemoff()
		this.soundemeraldoff()
		this.soundgoldoff()
		this.soundeatmoff()
		this.soundddieoff()
		this.sound1upoff()
	}

	private soundwobble(): void {
		this.soundwobbleflag = true
	}

	private soundwobbleoff(): void {
		this.soundwobbleflag = false
		this.soundwobblen = 0
	}

	private soundwobbleupdate(): void {
		if (this.soundwobbleflag) {
			this.soundwobblen++
			if (this.soundwobblen > 63) this.soundwobblen = 0
			switch (this.soundwobblen) {
				case 0:
					this.t2val = 0x7d0
					break
				case 16:
				case 48:
					this.t2val = 0x9c4
					break
				case 32:
					this.t2val = 0xbb8
					break
			}
		}
	}

	private startint8(): void {
		if (!this.int8flag) {
			this.timerrate = 0x4000
			this.settimer0(0x4000)
			this.int8flag = true
		}
	}

	private stopint8(): void {
		this.settimer0(0)
		if (this.int8flag) this.int8flag = false
		this.sett2val(40)
		this.setspkrt2()
	}

	// ── newsnd/newsnd2.c ──────────────────────────────────────────────────────

	private setupsound(): void {
		this.startint8()
	}

	private killsound(): void {
		this.setsoundt2()
		this.timer2(40)
		this.stopint8()
	}

	private settimer2(t2: number): void {
		if (t2 == 40) this.t2rate = 0
		else if (t2 == 0) this.t2rate = this.rate
		else this.t2rate = (this.rate * 65536) / t2
	}

	private timer2(t2: number): void {
		this.settimer2(t2)
	}

	private soundoff(): void {
		this.t2sw = false
	}

	private setspkrt2(): void {
		this.t2sw = true
	}

	private settimer0(t0: number): void {
		if (t0 == 0) this.t0rate = this.rate
		else this.t0rate = (this.rate * 65536) / t0
	}

	private timer0(t0: number): void {
		this.settimer0(t0)
	}

	private getsample2(): number {
		let t0 = 0
		let t2 = 0
		this.t0v = this.t0v + this.t0rate
		if (this.t0v >= 65536) {
			this.t0v = this.t0v % 65536
			this.timercount = this.timercount + this.timerrate
			if (this.timercount >= 65536) {
				this.timercount = this.timercount % 65536
				this.soundint()
				this.timercount -= 0x4000
				if (this.timercount < 0) this.timercount += 65536
			}
		}
		this.t2v = (this.t2v + this.t2rate) % 65536
		if (this.spkrmode != 0)
			if (this.t0v > this.pulsewidth * 63) t0 = -32767
			else t0 = 32767
		if (this.t2rate != 0 && this.t2sw) {
			if (this.t2v > 32767) t2 = -32767
			else t2 = 32767
		}
		return ((t0 + 2 * t2 + 98301) * (MAX_SAMP - MIN_SAMP)) / 196605 + MIN_SAMP
	}
}
