# Digger

A browser port of Windmill Software's 1983 IBM PC game Digger, served as an Astro homepage. The rules come from Andrew Jenner's Digger Remastered and Marek Futrega's JavaScript port. The page presents a 320×200 CGA framebuffer with WebGL.

## Play

```sh
pnpm install
pnpm dev
```

Open the URL Vite prints. The game fills the window and keeps an 8:5 picture.

- Any key starts from the title. Esc switches one and two player.
- Arrow keys move.
- Space or F1 fires.
- P pauses. Any key resumes.

## Lineage

Digger was written by Rob Sleath at Windmill Software in 1983. Jenner reconstructed it as Digger Remastered (GPL). Futrega ported that engine to Java and JavaScript. This tree follows that lineage under GPL-2.0. It does not ship the original Windmill binary and it does not use DOSBox.

## Deploy

Cloudflare comes later. `pnpm build` emits a static `dist/` that a Pages project can host.
