# Play with a friend on mobile (different place)
The server also hosts the game, so you only share ONE link.

## Fastest: Render (free, ~3 min)
1. Put this folder in a GitHub repo (upload the files).
2. render.com > New > Web Service > pick the repo. It reads render.yaml (start: `node server/server.js`).
3. Open the https://....onrender.com link on your phone. Create a room in Multiplayer.
4. Type `/link` in chat (or copy the address bar, it becomes `?room=CODE`) and send it to your friend.
   Their phone opens it and joins the room automatically.
(Free Render sleeps after idle; the first load can take ~30s.)

## No hosting: tunnel from your PC
Run `node server/server.js`, then `npx cloudflared tunnel --url http://localhost:8788`
(or ngrok http 8788) and send the https link it prints.

Voice chat needs HTTPS (both options give you that).
