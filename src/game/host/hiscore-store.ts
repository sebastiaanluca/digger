/**
 * High score table in localStorage as versioned JSON. Futrega kept only the scores; this keeps
 * the initials too. Missing or malformed data reads as ten "..." rows at 0.
 */

export interface HighScore {
	/** Three of A–Z, 0–9 or "." */
	readonly initials: string
	readonly score: number
}

/** Exactly 10 rows, best first. */
export type HighScoreTable = readonly HighScore[]

export interface HiScoreStore {
	load(): HighScoreTable
	save(table: HighScoreTable): void
}

export const HISCORE_KEY = 'digger.hiscores.v1'
const ROWS = 10

interface StoredV1 {
	readonly version: 1
	readonly rows: readonly HighScore[]
}

function emptyTable(): HighScore[] {
	return Array.from({ length: ROWS }, () => ({ initials: '...', score: 0 }))
}

function isRow(r: unknown): r is HighScore {
	if (typeof r !== 'object' || r === null) return false
	const { initials, score } = r as Record<string, unknown>
	return (
		typeof initials === 'string' &&
		/^[A-Z0-9.]{3}$/.test(initials) &&
		typeof score === 'number' &&
		Number.isInteger(score) &&
		score >= 0 &&
		score <= 999999
	)
}

export function decodeHiScores(raw: string | null): HighScore[] {
	if (raw === null) return emptyTable()
	try {
		const data = JSON.parse(raw) as Partial<StoredV1>
		if (data.version !== 1 || !Array.isArray(data.rows) || data.rows.length !== ROWS || !data.rows.every(isRow)) {
			return emptyTable()
		}
		return data.rows.map((r) => ({ initials: r.initials, score: r.score }))
	} catch {
		return emptyTable()
	}
}

export function encodeHiScores(table: HighScoreTable): string {
	const stored: StoredV1 = { version: 1, rows: table.slice(0, ROWS).map((r) => ({ initials: r.initials, score: r.score })) }
	return JSON.stringify(stored)
}

/** `storage` is null when localStorage is unavailable (privacy modes); the table then lives in memory. */
export function localHiScoreStore(storage: Storage | null): HiScoreStore {
	let memory: string | null = null
	let memoryOnly = storage === null
	return {
		load() {
			if (memoryOnly || !storage) return decodeHiScores(memory)
			try {
				return decodeHiScores(storage.getItem(HISCORE_KEY))
			} catch {
				memoryOnly = true
				return decodeHiScores(memory)
			}
		},
		save(table) {
			memory = encodeHiScores(table)
			if (memoryOnly || !storage) return
			try {
				storage.setItem(HISCORE_KEY, memory)
			} catch {
				// Quota or privacy mode: the in-memory copy serves the rest of this visit.
				memoryOnly = true
			}
		},
	}
}
