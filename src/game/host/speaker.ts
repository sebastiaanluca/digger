import { PcSpeaker } from '../audio/pc-speaker'
import workletUrl from '../audio/speaker.worklet.ts?worker&url'
import type { SoundCue, SpeakerMessage } from '../engine/sound-bus'

export interface Speaker {
	/** Called from a keydown; creates/resumes the AudioContext inside the user gesture. */
	unlock(): void
	/** Cues before unlock are dropped (the title is silent); cues while the worklet loads are queued. */
	play(cues: readonly SoundCue[]): void
	/** Hidden tab: the simulation stops, so the music must too. */
	suspend(): void
	resume(): void
	dispose(): void
}

const OUTPUT_GAIN = 0.5
const MAX_QUEUED = 256

type AudioContextCtor = new () => AudioContext

function audioContextCtor(): AudioContextCtor | null {
	const w = window as Window & { webkitAudioContext?: AudioContextCtor }
	return window.AudioContext ?? w.webkitAudioContext ?? null
}

export function createSpeaker(): Speaker {
	let ctx: AudioContext | null = null
	let send: ((cues: readonly SoundCue[]) => void) | null = null
	let queue: SoundCue[] | null = null
	let teardown: (() => void) | null = null
	let disposed = false

	const ready = (sink: (cues: readonly SoundCue[]) => void) => {
		if (disposed) return
		send = sink
		if (queue && queue.length > 0) sink(queue)
		queue = null
	}

	// Main-thread fallback for contexts without AudioWorklet (e.g. plain http on a LAN address).
	const startScriptProcessor = (ac: AudioContext, out: AudioNode) => {
		const speaker = new PcSpeaker(ac.sampleRate)
		const node = ac.createScriptProcessor(2048, 0, 1)
		node.onaudioprocess = (e) => speaker.fill(e.outputBuffer.getChannelData(0))
		node.connect(out)
		teardown = () => {
			node.onaudioprocess = null
			node.disconnect()
		}
		ready((cues) => {
			for (const c of cues) speaker.apply(c)
		})
	}

	const start = (ac: AudioContext) => {
		const gain = ac.createGain()
		gain.gain.value = OUTPUT_GAIN
		gain.connect(ac.destination)
		if (!ac.audioWorklet) {
			startScriptProcessor(ac, gain)
			return
		}
		ac.audioWorklet
			.addModule(workletUrl)
			.then(() => {
				if (disposed) return
				const node = new AudioWorkletNode(ac, 'digger-speaker', { numberOfInputs: 0, outputChannelCount: [1] })
				node.connect(gain)
				teardown = () => {
					node.port.close()
					node.disconnect()
				}
				ready((cues) => {
					const msg: SpeakerMessage = { cues }
					node.port.postMessage(msg)
				})
			})
			.catch((err: unknown) => {
				console.warn('Digger: AudioWorklet failed, using ScriptProcessor', err)
				if (!disposed) startScriptProcessor(ac, gain)
			})
	}

	return {
		unlock() {
			if (disposed) return
			if (ctx) {
				if (ctx.state === 'suspended' && !document.hidden) void ctx.resume()
				return
			}
			const Ctor = audioContextCtor()
			if (!Ctor) return
			try {
				ctx = new Ctor()
			} catch (err) {
				console.warn('Digger: no audio', err)
				return
			}
			queue = []
			start(ctx)
			void ctx.resume()
		},
		play(cues) {
			if (cues.length === 0) return
			if (send) send(cues)
			else if (queue) {
				queue.push(...cues)
				if (queue.length > MAX_QUEUED) queue.splice(0, queue.length - MAX_QUEUED)
			}
		},
		suspend() {
			if (ctx && ctx.state === 'running') void ctx.suspend()
		},
		resume() {
			if (ctx && ctx.state === 'suspended') void ctx.resume()
		},
		dispose() {
			if (disposed) return
			disposed = true
			teardown?.()
			teardown = null
			send = null
			queue = null
			if (ctx) void ctx.close().catch(() => {})
			ctx = null
		},
	}
}
