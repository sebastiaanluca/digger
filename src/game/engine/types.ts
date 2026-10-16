/*
 * Digger, 1983 Windmill Software (Rob Sleath). Digger Remastered by Andrew Jenner.
 * JavaScript port by Marek Futrega. TypeScript port for this site.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version. See LICENSE.
 */

/** Original encoding (0 right, 2 up, 4 left, 6 down). Sprite tables index by it. */
export type Dir = 0 | 2 | 4 | 6
/** Futrega's -1 means "not moving". The rule modules keep the numeric encoding so they diff. */
export type Heading = Dir | -1
export type PlayerIndex = 0 | 1
export type PlayerCount = 1 | 2
export type Colour = 0 | 1 | 2 | 3

/** Digger.reversedir */
export function reversedir(dir: number): number {
	switch (dir) {
		case 0:
			return 4
		case 4:
			return 0
		case 2:
			return 6
		case 6:
			return 2
	}
	return dir
}

declare const glyphBrand: unique symbol
/** A–Z or 0–9, upper-cased. Only the initials screen consumes it. */
export type Glyph = string & { readonly [glyphBrand]: true }

export function toGlyph(key: string): Glyph | null {
	const k = key.toUpperCase()
	return /^[A-Z0-9]$/.test(k) ? (k as Glyph) : null
}

/**
 * What the keyboard boundary produces. No key codes cross this line.
 * One key may yield several intents (a letter is Start + Type) so parsing never depends on
 * the session phase: the title reads presses, initials read Type, play reads Move/Fire/Pause.
 */
export type Intent =
	| { readonly type: 'Move'; readonly dir: Dir; readonly held: boolean }
	| { readonly type: 'Fire'; readonly held: boolean }
	| { readonly type: 'Pause' }
	| { readonly type: 'Start' }
	| { readonly type: 'TogglePlayers' }
	| { readonly type: 'Type'; readonly glyph: Glyph }
	| { readonly type: 'Erase' }

/**
 * "Any key" on the title and while paused. Pause is excluded because window blur also queues
 * it, and losing focus must neither start a game nor resume one; the P key still counts
 * through the Type it carries.
 */
export function isPress(i: Intent): boolean {
	switch (i.type) {
		case 'Move':
		case 'Fire':
			return i.held
		case 'Start':
		case 'Type':
		case 'Erase':
			return true
		case 'Pause':
		case 'TogglePlayers':
			return false
	}
}
