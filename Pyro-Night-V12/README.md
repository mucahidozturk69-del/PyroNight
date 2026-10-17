# Pyro Night v12 — Multiplayer Boss Beta

A browser fireworks sandbox with maps, destructive effects, mobile controls, rooms, voice, chat, soundboard and emotes.

## Run locally

Extract the whole ZIP to a regular folder; do not run it inside an archive. Double-click START_PYRO_NIGHT.vbs to start the local server without a terminal window and open the game. The server log is written to %TEMP%\pyro-night-server.log. Node.js 18 or newer is required. Alternatively, run node server/server.js from the project root. Opening index.html directly does not provide multiplayer.

## Multiplayer and Freddy Beta

The Multiplayer tab connects to the included Pyro Night WebSocket server. Rooms support up to five players, with room codes, host controls, chat, friends and voice. The Render start command is node server/server.js.

Freddy Fazbear is multiplayer-only. The host starts Freddy Beta from Multiplayer, in a room with at least two players. Freddy has 2320 HP, a firework blaster, stomp, star barrage, player throw and nearby breakable build pieces. To summon him, two different players each place and light two of their own Chica fireworks. Ignite All skips Chica fireworks whenever Chaos Mode is on, and while Freddy is arming.

Chaos Mode remains a host-only Multiplayer setting. Freddy does not start from solo play.

## Models and fireworks

The player character uses the supplied rig exported as assets/player-model.glb; change body colour in Settings. The separate supplied Freddy rig is assets/freddy-boss.glb. Five new Nextbot-inspired Special fireworks are Sanic Sonic Spiral, Mario Coin Comet, Nextbot Panic Swarm, Flowery Rush Bloom and Nextbot Multiverse Finale. Their picture sparks tumble and bounce, and catalogue items show a 1–10 power rating with a sort toggle.

## Controls

On touchscreens, move with the left joystick and look by dragging the right side. The on-screen buttons cover jump, run, light, ignite, emote, items and menu; More opens Use, Move, Turn and Chat.

On desktop: WASD move, Shift sprint, Space jump, E catalogue, F emote, X light, G move, R rotate, T tilt, Backspace remove, Enter Ignite All, / chat, Tab players, V camera, I settings, O world and B fire the boss blaster during Freddy Beta.

## Deploy to Render

Use the project root containing index.html, assets/, lib/ and server/ as Render's Root Directory; leave it blank if those files are at the repository root. Set the start command to node server/server.js. Replace the repository contents with this build rather than uploading it as a nested old-version folder; Render deploys only what is in the configured root.

This browser game uses its included WebSocket room server. Photon Fusion targets Unity clients; a Fusion App ID is not used by this HTML build.

## Package note

The FBX/Blend source models and conversion previews are not needed at runtime and are omitted from the release ZIP. The optimized GLB models are included. The game was not launched during this packaging task.