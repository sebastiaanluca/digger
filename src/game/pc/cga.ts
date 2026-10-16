/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from digjs/src/Pc.js. This is the only owner of the packed framebuffer.
 *
 * Futrega stored each byte with its four pixels reversed (pixel 0 in bits 1..0) and kept an
 * RGBA mirror. Here VRAM is real CGA order (pixel 0 in bits 7..6), linear 80 bytes per row,
 * matching the cgagrafx and font bytes, so the C masks in Digger.updatefire (0xc0 for the
 * leftmost pixel, 3 for the rightmost) test the pixels the original tested.
 */

import { ASCII2CGA } from '../data/alpha'
import { CGATABLE, TITLE_RLE } from '../data/cgagrafx'

export const VRAM_STRIDE = 80
export const VRAM_ROWS = 200
export const VRAM_BYTES = VRAM_STRIDE * VRAM_ROWS

const WIDTH = 320

export interface PresentedFrame {
	/** 80×200 bytes, 4 px per byte, MSB-first. */
	readonly vram: Uint8Array
	readonly intensity: 0 | 1
	/** Bumped on every VRAM or register write; the presenter skips the upload when unchanged. */
	readonly version: number
}

declare const saveUnderBrand: unique symbol
/** Opaque handle to a save-under buffer; the bytes stay inside this module. */
export type SaveUnder = { readonly [saveUnderBrand]: true }

const saveUnderBytes = new WeakMap<SaveUnder, Uint8Array>()

function bytesOf(p: SaveUnder): Uint8Array {
	const b = saveUnderBytes.get(p)
	if (!b) throw new Error('Unknown save-under buffer')
	return b
}

export class Cga {
	/** 16 KB like the real CGA aperture; rows past 199 are scratch that is never shown. */
	private readonly pixels = new Uint8Array(0x4000)
	private intensity: 0 | 1 = 0
	private version = 0

	allocSaveUnder(bytes: number): SaveUnder {
		const handle = Object.freeze({}) as SaveUnder
		saveUnderBytes.set(handle, new Uint8Array(bytes))
		return handle
	}

	gclear(): void {
		this.pixels.fill(0)
		this.version++
	}

	ggeti(x: number, y: number, p: SaveUnder, w: number, h: number): void {
		const buf = bytesOf(p)
		let src = 0
		let dest = (y * WIDTH + x) >> 2
		for (let i = 0; i < h; i++) {
			let d = dest
			for (let j = 0; j < w; j++) {
				buf[src++] = this.pixels[d++] ?? 0
				if (src == buf.length) return
			}
			dest += WIDTH >> 2
		}
	}

	ggetpix(x: number, y: number): number {
		return this.pixels[(WIDTH * y + x) >> 2] ?? 0
	}

	ginten(inten: number): void {
		const i = (inten & 1) as 0 | 1
		if (this.intensity == i) return
		this.intensity = i
		this.version++
	}

	gputi(x: number, y: number, p: SaveUnder, w: number, h: number): void {
		const buf = bytesOf(p)
		let src = 0
		let dest = (y * WIDTH + x) >> 2
		this.version++
		for (let i = 0; i < h; i++) {
			let d = dest
			for (let j = 0; j < w; j++) {
				this.pixels[d++] = buf[src++]
				if (src == buf.length) return
			}
			dest += WIDTH >> 2
		}
	}

	/** Masked blit: a pixel whose two mask bits are both clear takes the sprite's pixel. */
	gputim(x: number, y: number, ch: number, w: number, h: number): void {
		const entry = CGATABLE[ch]
		if (!entry) return
		const spr = entry.bits
		const msk = entry.mask
		let src = 0
		let dest = (y * WIDTH + x) >> 2
		this.version++
		for (let i = 0; i < h; i++) {
			let d = dest
			for (let j = 0; j < w; j++) {
				const px = spr[src]
				const mx = msk[src]
				let ax = this.pixels[d]
				src++
				for (let shift = 6; shift >= 0; shift -= 2) {
					if (((mx >> shift) & 3) == 0) ax = (ax & ~(3 << shift)) | (px & (3 << shift))
				}
				this.pixels[d] = ax
				d++
				if (src == spr.length || src == msk.length) return
			}
			dest += WIDTH >> 2
		}
	}

	/** Decodes the title RLE, de-interleaving the CGA even/odd banks into linear rows. */
	gtitle(): void {
		const data = TITLE_RLE
		let src = 0
		let dest = 0
		this.version++
		while (true) {
			if (src >= data.length) break
			const b = data[src++]
			let l: number
			let c: number
			if (b == 0xfe) {
				l = data[src++]
				if (l == 0) l = 256
				c = data[src++]
			} else {
				l = 1
				c = b
			}
			for (let i = 0; i < l; i++) {
				let adst: number
				if (dest < 32768) adst = Math.floor(dest / 320) * 640 + (dest % 320)
				else adst = 320 + Math.floor((dest - 32768) / 320) * 640 + ((dest - 32768) % 320)
				const at = adst >> 2
				if (at < VRAM_BYTES) this.pixels[at] = c
				dest += 4
				if (dest >= 65535) break
			}
			if (dest >= 65535) break
		}
	}

	gwrite(x: number, y: number, ch: string, c: number): void {
		c &= 3
		let dest = (y * WIDTH + x) >> 2
		let ofs = 0
		const color = c | (c << 2) | (c << 4) | (c << 6)
		const code = ch.charCodeAt(0) - 32
		if (code < 0 || code > 0x5f) return
		const chartab = ASCII2CGA[code]
		if (!chartab) return
		this.version++
		for (let i = 0; i < 12; i++) {
			let d = dest
			for (let j = 0; j < 3; j++) {
				this.pixels[d] = chartab[ofs++] & color
				d++
			}
			dest += WIDTH >> 2
		}
	}

	present(): PresentedFrame {
		return {
			vram: this.pixels.subarray(0, VRAM_BYTES),
			intensity: this.intensity,
			version: this.version,
		}
	}
}
