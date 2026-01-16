# chessini

A 2-player online 1v1 spaghetti-themed chess game with a Node.js WebSocket server and an HTML5 client.

## Folder Structure

```
/client
  index.html
  main.js
  style.css
/server
  package.json
  server.js
README.md
```

## Requirements

- Node.js 18+
- A modern browser

## Install & Run Server

```bash
cd server
npm install
npm start
```

The WebSocket server runs on `ws://localhost:8080` by default.

## Run Client

Open `client/index.html` in a browser. For local hosting, you can run a simple server from the repo root:

```bash
cd client
python -m http.server 5173
```

Then open `http://localhost:5173` in your browser.

## Multiplayer Flow

- Enter a username and room name.
- Create a room to wait for an opponent.
- Another player joins from the room list and the match starts automatically.

## Chess Rules

- Turn order is enforced.
- Server validates legal moves and prevents moves that leave the king in check.
- Castling is supported.
- En passant is supported.
- Pawn promotion automatically becomes a queen.

## Packaging

To zip the HTML5 client:

```bash
cd client
zip -r chessini-client.zip .
```

To zip the full project:

```bash
cd ..
zip -r chessini-full.zip client server README.md
```
