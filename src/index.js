import express from "express";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { WebSocketServer } from "ws";
import { SecondaryTokenAuthenticator } from "./collaboration/SecondaryTokenAuthenticator.js";
import { TravelDocWebSocketServer } from "./collaboration/TravelDocWebSocketServer.js";
import { YLeveldbPersistence } from "./collaboration/YLeveldbPersistence.js";
import { YWebSocketHandler } from "./collaboration/YWebSocketHandler.js";

const port = Number(process.env.PORT ?? 1234);
const yLeveldbPath = resolve(process.env.Y_LEVELDB_PATH ?? ".data/y-leveldb");
const secondaryJwtSecret = process.env.SECONDARY_JWT_SECRET;
const maxUsersPerRoom = Number(process.env.MAX_USERS_PER_ROOM ?? 20);

const require = createRequire(import.meta.url);
const utils = require("y-websocket/bin/utils");

const app = express();

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const persistenceLayer = new YLeveldbPersistence({ utils, yLeveldbPath });
await persistenceLayer.initialize();

const authenticator = new SecondaryTokenAuthenticator({ secondaryJwtSecret });
const yWebSocketHandler = new YWebSocketHandler({ utils });
const travelDocWebSocketServer = new TravelDocWebSocketServer({
  server,
  wss,
  authenticator,
  yWebSocketHandler,
  maxUsersPerRoom
});
travelDocWebSocketServer.start();

server.listen(port, () => {
  console.log(`HTTP server listening on http://localhost:${port}`);
  console.log(`WebSocket server listening on ws://localhost:${port}?st={secondaryToken}`);
  console.log(`Y-LevelDB path: ${yLeveldbPath}`);
});
