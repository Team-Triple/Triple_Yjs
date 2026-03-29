import { createRequire } from "node:module";
import { WebSocketServer } from "ws";

const require = createRequire(import.meta.url);
const utils = require("y-websocket/bin/utils");
const port = Number(process.env.PORT ?? 1234);

const wss = new WebSocketServer({ port });

wss.on("connection", (ws, req) => {
  // Connect the client to Yjs docs using req.url as the room path.
  utils.setupWSConnection(ws, req);

  console.log("CLIENT::CONNECTED", req.url);
  ws.on("message", message => console.log("CLIENT::MESSAGE", message.toString()));
  ws.on("close", () => console.log("CLIENT::DISCONNECTED", req.url));
});

console.log(`Yjs WebSocket server listening on ws://localhost:${port}`);
