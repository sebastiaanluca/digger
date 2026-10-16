/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 *
 * Ported from Pc.pals in digjs/src/Pc.js.
 */

export type Rgb = readonly [number, number, number]
export type Palette4 = readonly [Rgb, Rgb, Rgb, Rgb]

/** CGA palette 0 at low and high intensity, Futrega's tuned values. */
export const CGA_RGB: { readonly [I in 0 | 1]: Palette4 } = {
	0: [
		[0x00, 0x00, 0x00],
		[0x00, 0xcc, 0x00],
		[0xcc, 0x00, 0x00],
		[0xcc, 0x74, 0x00],
	],
	1: [
		[0x00, 0x00, 0x00],
		[0x64, 0xff, 0x64],
		[0xff, 0x64, 0x64],
		[0xff, 0xff, 0x64],
	],
}
