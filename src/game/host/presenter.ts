import { VRAM_ROWS, VRAM_STRIDE, type PresentedFrame } from '../pc/cga'
import { CGA_RGB } from '../pc/palette'

export interface Presenter {
	present(frame: PresentedFrame): void
	dispose(): void
}

export interface PresenterOptions {
	/** prefers-reduced-motion: ease intensity flips (bonus flashing) over ~150 ms instead of switching hard. */
	readonly reducedMotion: () => boolean
}

export class WebGL2UnavailableError extends Error {
	constructor() {
		super('Digger needs WebGL2 to draw its screen, and this browser does not provide it.')
		this.name = 'WebGL2UnavailableError'
	}
}

const SCREEN_W = 320
const SCREEN_H = 200
const INTENSITY_EASE_MS = 150

const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/** Unpacks 2bpp MSB-first CGA bytes; u_view is the letterboxed 8:5 picture in window pixels. */
const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D u_vram;
uniform vec3 u_rgb[4];
uniform vec4 u_view;
out vec4 o;
void main() {
	vec2 uv = (gl_FragCoord.xy - u_view.xy) / u_view.zw;
	if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) {
		o = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}
	ivec2 px = ivec2(floor(vec2(uv.x, 1.0 - uv.y) * vec2(320.0, 200.0)));
	px = clamp(px, ivec2(0), ivec2(319, 199));
	uint b = texelFetch(u_vram, ivec2(px.x >> 2, px.y), 0).r;
	uint c = (b >> uint(6 - 2 * (px.x & 3))) & 3u;
	vec3 rgb = c == 0u ? u_rgb[0] : c == 1u ? u_rgb[1] : c == 2u ? u_rgb[2] : u_rgb[3];
	o = vec4(rgb, 1.0);
}`

interface GlResources {
	readonly program: WebGLProgram
	readonly vao: WebGLVertexArrayObject
	readonly texture: WebGLTexture
	readonly uVram: WebGLUniformLocation | null
	readonly uRgb: WebGLUniformLocation | null
	readonly uView: WebGLUniformLocation | null
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type)
	if (!shader) throw new Error('Digger: could not create a WebGL shader')
	gl.shaderSource(shader, source)
	gl.compileShader(shader)
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
		const log = gl.getShaderInfoLog(shader)
		gl.deleteShader(shader)
		throw new Error(`Digger: shader failed to compile: ${log ?? ''}`)
	}
	return shader
}

function build(gl: WebGL2RenderingContext): GlResources {
	const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
	const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
	const program = gl.createProgram()
	const vao = gl.createVertexArray()
	const texture = gl.createTexture()
	if (!program || !vao || !texture) throw new Error('Digger: could not allocate WebGL resources')
	gl.attachShader(program, vs)
	gl.attachShader(program, fs)
	gl.linkProgram(program)
	gl.deleteShader(vs)
	gl.deleteShader(fs)
	if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
		throw new Error(`Digger: shader program failed to link: ${gl.getProgramInfoLog(program) ?? ''}`)
	}

	gl.bindTexture(gl.TEXTURE_2D, texture)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
	gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8UI, VRAM_STRIDE, VRAM_ROWS)

	return {
		program,
		vao,
		texture,
		uVram: gl.getUniformLocation(program, 'u_vram'),
		uRgb: gl.getUniformLocation(program, 'u_rgb'),
		uView: gl.getUniformLocation(program, 'u_view'),
	}
}

function release(gl: WebGL2RenderingContext, res: GlResources): void {
	gl.deleteTexture(res.texture)
	gl.deleteVertexArray(res.vao)
	gl.deleteProgram(res.program)
}

/** Palette 0 at low (k=0) and high (k=1) intensity, mixed for the reduced-motion ease. */
function paletteUniform(k: number, into: Float32Array): Float32Array {
	const lo = CGA_RGB[0]
	const hi = CGA_RGB[1]
	for (let c = 0; c < 4; c++)
		for (let ch = 0; ch < 3; ch++) into[c * 3 + ch] = (lo[c][ch] + (hi[c][ch] - lo[c][ch]) * k) / 255
	return into
}

/**
 * WebGL2 only: one 80×200 R8UI texture holding the packed CGA bytes and a 4-entry palette
 * uniform. The backing store follows the CSS box × devicePixelRatio; context loss rebuilds the
 * GL objects from the next frame, since VRAM lives on the CPU.
 */
export function createPresenter(canvas: HTMLCanvasElement, options: PresenterOptions): Presenter {
	const gl = canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		premultipliedAlpha: false,
		preserveDrawingBuffer: false,
		powerPreference: 'high-performance',
	})
	if (!gl) throw new WebGL2UnavailableError()

	let res: GlResources | null = build(gl)
	let lost = false
	let dirty = true
	let lastVersion = -1
	let shown = 0
	let drawnShown = -1
	let lastTime = performance.now()
	const rgb = new Float32Array(12)

	const setSize = (w: number, h: number) => {
		const width = Math.max(1, Math.round(w))
		const height = Math.max(1, Math.round(h))
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width
			canvas.height = height
		}
		dirty = true
	}

	const dpr = window.devicePixelRatio || 1
	setSize(canvas.clientWidth * dpr || SCREEN_W, canvas.clientHeight * dpr || SCREEN_H)

	const ro = new ResizeObserver((entries) => {
		const entry = entries[entries.length - 1]
		if (!entry) return
		const device = entry.devicePixelContentBoxSize?.[0]
		if (device) {
			setSize(device.inlineSize, device.blockSize)
			return
		}
		const ratio = window.devicePixelRatio || 1
		const box = entry.contentBoxSize?.[0]
		setSize((box ? box.inlineSize : entry.contentRect.width) * ratio, (box ? box.blockSize : entry.contentRect.height) * ratio)
	})
	try {
		ro.observe(canvas, { box: 'device-pixel-content-box' })
	} catch {
		ro.observe(canvas)
	}

	const onLost = (e: Event) => {
		e.preventDefault()
		lost = true
		res = null
	}
	const onRestored = () => {
		lost = false
		res = build(gl)
		lastVersion = -1
		dirty = true
	}
	canvas.addEventListener('webglcontextlost', onLost)
	canvas.addEventListener('webglcontextrestored', onRestored)

	return {
		present(frame) {
			if (lost || !res) return
			const now = performance.now()

			if (frame.version !== lastVersion) {
				gl.bindTexture(gl.TEXTURE_2D, res.texture)
				gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, VRAM_STRIDE, VRAM_ROWS, gl.RED_INTEGER, gl.UNSIGNED_BYTE, frame.vram)
				lastVersion = frame.version
				dirty = true
			}

			const target = frame.intensity
			if (options.reducedMotion()) {
				const stepBy = (now - lastTime) / INTENSITY_EASE_MS
				shown = shown < target ? Math.min(target, shown + stepBy) : Math.max(target, shown - stepBy)
			} else shown = target
			lastTime = now
			if (shown !== drawnShown) dirty = true
			if (!dirty) return

			const w = canvas.width
			const h = canvas.height
			const scale = Math.min(w / SCREEN_W, h / SCREEN_H)
			const vw = SCREEN_W * scale
			const vh = SCREEN_H * scale

			gl.viewport(0, 0, w, h)
			gl.useProgram(res.program)
			gl.bindVertexArray(res.vao)
			gl.activeTexture(gl.TEXTURE0)
			gl.bindTexture(gl.TEXTURE_2D, res.texture)
			gl.uniform1i(res.uVram, 0)
			gl.uniform3fv(res.uRgb, paletteUniform(shown, rgb))
			gl.uniform4f(res.uView, (w - vw) / 2, (h - vh) / 2, vw, vh)
			gl.drawArrays(gl.TRIANGLES, 0, 3)
			gl.bindVertexArray(null)

			drawnShown = shown
			dirty = false
		},
		dispose() {
			ro.disconnect()
			canvas.removeEventListener('webglcontextlost', onLost)
			canvas.removeEventListener('webglcontextrestored', onRestored)
			if (res && !gl.isContextLost()) release(gl, res)
			res = null
			lost = true
		},
	}
}
