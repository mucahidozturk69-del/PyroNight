# Pyro Night v9 - Render build

A first/third-person fireworks sandbox. Place fireworks, light the fuse yourself, blow up apartment towers, dig craters,
build and publish maps, and play with friends in rooms with your own room codes.

**Render:** Start command: node server/server.js. The server uses Render’s PORT and serves the game plus multiplayer WebSocket. For local Windows play, run START_PYRO_NIGHT.vbs.

## Quick start
For local multiplayer, extract the **entire ZIP** to a normal folder first (do not run the launcher inside WinRAR), then double-click `START_PYRO_NIGHT.vbs`. It starts the included server in the background (no terminal window) and opens the game at http://localhost:8789. Server diagnostics go to `%TEMP%\pyro-night-server.log`. Alternatively, open a terminal in `server` and run `node server.js`. Node 18+ is required; there are **no npm packages** to install. Opening `index.html` by itself does not start the multiplayer server.

## Maps (pick in the Maps tab, host picks for a room)
| Map | What it is |
|---|---|
| Lakeside Town | Lake and pier, a town with enterable shops/houses (working doors, lamps, TVs), roads, cars, city towers |
| Apartment District | Tall **voxel** apartment towers with stairs inside; destroyed chunks make the rest crumble |
| Open Plains | A wide meadow with instanced grass, trees, bushes and dirt paths |
| Flat Arena | Completely flat and empty. The ground itself deforms, so blasts leave real craters |
| Dreamcore Meadow | Rolling grass, pastel rainbow portal, floating clouds, a pale cottage and liminal landmarks |

## Controls
On touchscreens, use the left joystick to move, drag the right side of the screen to look, and use the on-screen Jump, Run, Light, Ignite, Emote, Items and Menu buttons. Tap More for Use, Move, Turn and Chat. Tap the world to select or place a firework.

On desktop, WASD move, Shift sprint, Space jump, mouse look (right-drag if the browser blocks mouse capture). **E** catalogue (click a firework to spawn it), **F** emote (works even when pointer lock is unavailable),
click to place/select, **G** move, **R** rotate, **T** tilt, **X** light, **Backspace** remove, **Enter** ignite all, **Q** use doors/lamps/TVs,
**V** camera, **/** chat, **Tab** players, **M** map creator, **I** or the gear for settings, **O** world, **H** hide UI.

## Environmental damage (host decides in a room)
World tab: environmental damage, voxel destruction, craters, strength. In a multiplayer room **only the host** can change these,
and the server enforces it. Damage is computed from the same seeded random numbers on every client, so everyone sees the same result.
Voxel destruction applies to the Apartment District; the town uses breakable glass, dented/burning cars, scattered furniture and scorch marks;
craters dig into the Flat Arena and scorch the ground on other maps.

## Nextbot
Catalogue > Special > Nextbot. Uses `assets/nextbot.jpg` and plays `assets/nextbot.mp3` when it gets close. In solo anyone can place it;
in a room **only the host** can (server-enforced). The host simulates it and streams its position to everyone.

## Multiplayer
- Server: `server/server.js` (WebSocket, rooms, host rules, chat, friends, map gallery). Rooms use **custom codes** (3-8 letters/numbers) and support up to **5 players**.
- Chat: `/` opens chat in game. `/g` global, `/r` room, `/help`, `/players`, `/code`, `/name`, host: `/kick`, `/map`, `/dmg`.
- Published maps keep the author's name and are announced in chat. They live in `server/published-maps.json`.
- Voice chat: while in a room, open Multiplayer and select **Enable voice chat**. The browser asks for microphone permission only then. Use HTTPS for a deployed game (localhost is allowed for local play); the green speaking bars sit beside each player's name.
- Soundboard: open **Soundboard** and press a sound button; its clip plays for you and relays to room members.
- Set the server address in the Multiplayer tab or in `config.js` (`window.PYRO_SOCKET_URL='wss://...'`). Opening Multiplayer now attempts to connect automatically.
- Deploying: run `node server.js` on any Node host (set `PORT`, put it behind TLS so clients can use `wss://`, optionally `ALLOWED_ORIGINS`).
  CrazyGames games that use their own backend must follow CrazyGames' multiplayer and privacy rules; check them before submitting.
- Prototype security: friend codes are not authenticated, there is no moderation beyond host kick, and chat is unfiltered. Add accounts,
  a profanity filter and reporting before a public release.

### About Photon
Photon Fusion has no JavaScript SDK (it is for Unity-style engines), and a Fusion App ID does not work with Photon's JavaScript products
(Realtime, Chat, Voice). So this build uses its own small server instead. The networking is isolated in `Net` object inside `index.html`,
so a Photon **Realtime** transport could be added later with a Realtime App ID. Voice uses browser WebRTC; the room server relays offers and ICE candidates, while audio travels peer-to-peer. It currently uses a public STUN server; restrictive NATs may need a configured TURN relay.

## Verification notes
This package has not been runtime-checked after the latest multiplayer and voice changes. Real WebGL appearance and microphone behavior still depend on the browser, GPU, microphone permission, and network path.

## Known limits
- Textures are generated (tileable with normal maps, in `assets/tex`), not photographs. Models are built from primitives.
- Voxel destruction only exists in the Apartment District. The lake town and map-creator blocks are not voxel.
- Many separate meshes in the town can be heavy on weak GPUs; use Quality/Resolution scale/shadows settings.
- Touchscreen controls are supported on touch devices. For best results, play from an HTTPS-hosted copy in a mobile browser; the ZIP is a web game, not an installable phone app.
- Interior "real apartments" are open floors with partition walls, stairs and ceiling lamps, not furnished flats.

## Files
`index.html` game, `config.js` server address, `lib/` three.js r128 (MIT), `assets/` textures + nextbot files, `audio/` menu music and `assets/sounds/` soundboard clips,
`server/` multiplayer server, `tools/gen_tex.py` regenerates the textures (optional Python dependencies: NumPy, Pillow, SciPy). It writes into the bundled `assets/tex` folder by default.
