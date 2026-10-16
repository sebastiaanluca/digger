/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * AudioWorkletGlobalScope entry: registerProcessor('digger-speaker'). Owns all sound state;
 * the main thread only posts cues, which apply at the next render quantum.
 */

import type { SpeakerMessage } from '../engine/sound-bus'
import { PcSpeaker } from './pc-speaker'

// AudioWorkletGlobalScope globals; TypeScript's DOM lib does not describe this scope.
declare const sampleRate: number
declare class AudioWorkletProcessor {
	readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

class DiggerSpeakerProcessor extends AudioWorkletProcessor {
	private readonly speaker = new PcSpeaker(sampleRate)

	constructor() {
		super()
		this.port.onmessage = (e: MessageEvent<SpeakerMessage>) => {
			for (const cue of e.data.cues) this.speaker.apply(cue)
		}
	}

	process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
		const out = outputs[0]
		if (out && out.length > 0) {
			this.speaker.fill(out[0])
			for (let c = 1; c < out.length; c++) out[c].set(out[0])
		}
		return true
	}
}

registerProcessor('digger-speaker', DiggerSpeakerProcessor)
