import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { WebSocketServer } from "ws";

const require = createRequire(import.meta.url);
const utils = require("y-websocket/bin/utils");
const jwt = require("jsonwebtoken");
const Y = require("yjs");
const { LeveldbPersistence } = require("y-leveldb");
const port = Number(process.env.PORT ?? 1234);
const jwtSecret = process.env.JWT_SECRET;
const travelDocPrefix = "travel-doc";
const yLeveldbPath = resolve(process.env.Y_LEVELDB_PATH ?? ".data/y-leveldb");
const userSessions = new Map();

await mkdir(yLeveldbPath, { recursive: true });

const ldb = new LeveldbPersistence(yLeveldbPath);
utils.setPersistence({
  provider: ldb,
  bindState: async (docName, ydoc) => {
    const persistedYdoc = await ldb.getYDoc(docName);
    const newUpdates = Y.encodeStateAsUpdate(ydoc);

    if (newUpdates.byteLength > 0) {
      await ldb.storeUpdate(docName, newUpdates);
    }

    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    ydoc.on("update", update => {
      void ldb.storeUpdate(docName, update);
    });
  },
  writeState: async () => {}
});

function getRequestUrl(req) {
  const host = req.headers.host ?? `localhost:${port}`;
  return new URL(req.url ?? "/", `http://${host}`);
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    const [scheme, token] = authHeader.split(" ");
    if (/^Bearer$/i.test(scheme) && token) {
      return token;
    }
  }

  const tokenFromQuery = getRequestUrl(req).searchParams.get("token");
  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  return null;
}

function extractTravelItineraryId(req) {
  const requestUrl = getRequestUrl(req);
  const pathParts = requestUrl.pathname.split("/").filter(Boolean);

  if (pathParts[0] === travelDocPrefix && pathParts[1]) {
    return decodeURIComponent(pathParts[1]);
  }

  const travelItineraryId = requestUrl.searchParams.get("travelItineraryId");
  if (travelItineraryId) {
    return travelItineraryId;
  }

  return null;
}

function rejectUpgrade(socket, statusCode, message) {
  const statusText =
    statusCode === 400
      ? "Bad Request"
      : statusCode === 401
        ? "Unauthorized"
        : "Internal Server Error";
  const body = `${message}\n`;
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      `\r\n${body}`
  );
  socket.destroy();
}

function authenticateUpgrade(req) {
  if (!jwtSecret) {
    return { ok: false, statusCode: 500, message: "JWT_SECRET is not set" };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, statusCode: 401, message: "Missing JWT token" };
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    return { ok: false, statusCode: 401, message: "Invalid JWT token" };
  }

  const rawUserId = payload?.userId;
  if (typeof rawUserId !== "string" && typeof rawUserId !== "number") {
    return { ok: false, statusCode: 401, message: "Missing userId claim" };
  }
  const userId = String(rawUserId);

  const travelItineraryId = extractTravelItineraryId(req);
  if (!travelItineraryId) {
    return {
      ok: false,
      statusCode: 400,
      message: "Missing travelItineraryId (use /travel-doc/{travelItineraryId})"
    };
  }

  return {
    ok: true,
    session: {
      userId,
      travelItineraryId,
      docName: `${travelDocPrefix}/${travelItineraryId}`
    }
  };
}

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      ok: true,
      websocket: `ws://localhost:${port}/travel-doc/{travelItineraryId}?token={jwt}`
    })
  );
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const authResult = authenticateUpgrade(req);
  if (!authResult.ok) {
    rejectUpgrade(socket, authResult.statusCode, authResult.message);
    return;
  }

  req.session = authResult.session;
  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const session = req.session;
  if (!session) {
    ws.close(1011, "session missing");
    return;
  }
  const { userId, travelItineraryId, docName } = session;

  ws.session = session;

  if (!userSessions.has(userId)) {
    userSessions.set(userId, new Set());
  }
  userSessions.get(userId).add(ws);

  utils.setupWSConnection(ws, req, { docName });
  console.log(`CLIENT::CONNECTED userId=${userId} room=${docName}`);

  ws.on("close", () => {
    const sessions = userSessions.get(userId);
    if (sessions) {
      sessions.delete(ws);
      if (sessions.size === 0) {
        userSessions.delete(userId);
      }
    }
    console.log(`CLIENT::DISCONNECTED userId=${userId} room=${docName}`);
  });
});

server.listen(port, () => {
  console.log(`Yjs WebSocket server listening on ws://localhost:${port}`);
  console.log(`Y-LevelDB path: ${yLeveldbPath}`);
  console.log(
    `Connect format: ws://localhost:${port}/travel-doc/{travelItineraryId}?token={jwt}`
  );
});
