# Moonfall

Mobile-first social deduction game UI. Includes profile setup, private room creation with a six-character code, joining by code, a waiting room, and the first secret-role/night-action flow.

## Run locally

```bash
npm install
npm run dev
```

Room presence is synchronized through the WebSocket server on the same port. The room list is kept in server memory and is cleared when the server restarts.

## Share with ngrok

Keep `npm run dev` running, then expose the same port:

```bash
ngrok http 5173
```

Open the generated ngrok URL in the moderator tab and in the other player tabs. Do not run `vite` separately, because `npm run dev` now starts both Vite and the room WebSocket server.

## Build for GitHub

```bash
npm run build
```