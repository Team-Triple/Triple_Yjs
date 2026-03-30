// 인증/세션/room 서비스와 연결된 WebSocket 업그레이드 및 연결 처리기.
import { WebSocketServer } from "ws";

export function attachWebSocketServer({
  server,
  utils,
  authenticateUpgrade,
  rejectUpgrade,
  roomParticipants,
  userSessions,
  maxUsersPerDoc
}) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const authResult = authenticateUpgrade(req);
    if (!authResult.ok) {
      rejectUpgrade(socket, authResult.statusCode, authResult.message);
      return;
    }

    const { docName, userId } = authResult.session;
    if (!roomParticipants.canJoin(docName, userId)) {
      rejectUpgrade(
        socket,
        403,
        `Room user limit exceeded (max ${maxUsersPerDoc} users per document)`
      );
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

    const { userId, docName } = session;
    ws.session = session;

    roomParticipants.add(docName, userId);
    userSessions.add(userId, ws);

    utils.setupWSConnection(ws, req, { docName });
    console.log(`CLIENT::CONNECTED userId=${userId} room=${docName}`);

    ws.on("close", () => {
      userSessions.remove(userId, ws);
      roomParticipants.remove(docName, userId);
      console.log(`CLIENT::DISCONNECTED userId=${userId} room=${docName}`);
    });
  });

  return wss;
}
