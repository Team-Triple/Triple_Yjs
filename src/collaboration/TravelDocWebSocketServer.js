export class TravelDocWebSocketServer {
  constructor({ server, wss, authenticator, yWebSocketHandler, maxUsersPerRoom = 20 }) {
    this.server = server;
    this.wss = wss;
    this.authenticator = authenticator;
    this.yWebSocketHandler = yWebSocketHandler;
    this.maxUsersPerRoom = maxUsersPerRoom;

    this.userSessions = new Map();
    this.roomParticipants = new Map();
  }

  start() {
    this.server.on("upgrade", this.handleUpgrade.bind(this));
    this.wss.on("connection", this.handleConnection.bind(this));
  }

  handleUpgrade(req, socket, head) {
    const authResult = this.authenticator.authenticateUpgrade(req);
    if (!authResult.ok) {
      this.rejectUpgrade(socket, authResult.statusCode, authResult.message);
      return;
    }

    const { travelDocId, userId } = authResult.session;
    if (!this.canJoinRoom(travelDocId, userId)) {
      this.rejectUpgrade(
        socket,
        403,
        `Room user limit exceeded (max ${this.maxUsersPerRoom} users per room)`
      );
      return;
    }
    if (!this.authenticator.consumeSecondaryToken(authResult.secondaryToken)) {
      this.rejectUpgrade(socket, 401, "Secondary token already used");
      return;
    }

    req.session = authResult.session;
    this.wss.handleUpgrade(req, socket, head, ws => {
      this.wss.emit("connection", ws, req);
    });
  }

  handleConnection(ws, req) {
    const session = req.session;
    if (!session) {
      ws.close(1011, "session missing");
      return;
    }

    const { userId, travelDocId } = session;
    this.addRoomParticipant(travelDocId, userId);
    this.addUserSession(userId, ws);
    this.yWebSocketHandler.handleConnection(ws, req, session);

    ws.on("close", () => {
      this.removeUserSession(userId, ws);
      this.removeRoomParticipant(travelDocId, userId);
    });
  }

  canJoinRoom(travelDocId, userId) {
    const participants = this.roomParticipants.get(travelDocId);
    if (!participants) {
      return true;
    }
    if (participants.has(userId)) {
      return true;
    }
    return participants.size < this.maxUsersPerRoom;
  }

  addRoomParticipant(travelDocId, userId) {
    if (!this.roomParticipants.has(travelDocId)) {
      this.roomParticipants.set(travelDocId, new Map());
    }

    const participants = this.roomParticipants.get(travelDocId);
    const count = participants.get(userId) ?? 0;
    participants.set(userId, count + 1);
  }

  removeRoomParticipant(travelDocId, userId) {
    const participants = this.roomParticipants.get(travelDocId);
    if (!participants) {
      return;
    }

    const count = participants.get(userId);
    if (count === undefined) {
      return;
    }

    if (count <= 1) {
      participants.delete(userId);
    } else {
      participants.set(userId, count - 1);
    }

    if (participants.size === 0) {
      this.roomParticipants.delete(travelDocId);
    }
  }

  addUserSession(userId, ws) {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId).add(ws);
  }

  removeUserSession(userId, ws) {
    const sessions = this.userSessions.get(userId);
    if (!sessions) {
      return;
    }

    sessions.delete(ws);
    if (sessions.size === 0) {
      this.userSessions.delete(userId);
    }
  }

  rejectUpgrade(socket, statusCode, message) {
    let statusText = "Internal Server Error";
    if (statusCode === 400) {
      statusText = "Bad Request";
    } else if (statusCode === 401) {
      statusText = "Unauthorized";
    } else if (statusCode === 403) {
      statusText = "Forbidden";
    }

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
}
