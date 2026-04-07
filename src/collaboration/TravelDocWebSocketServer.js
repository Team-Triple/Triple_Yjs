export class TravelDocWebSocketServer {
  constructor({ server, wss, authenticator, yWebSocketHandler, maxUsersPerRoom = 20 }) {
    this.server = server;
    this.wss = wss;
    this.authenticator = authenticator;
    this.yWebSocketHandler = yWebSocketHandler;
    this.maxUsersPerRoom = maxUsersPerRoom;

    this.userSessions = new Map();
    this.roomParticipants = new Map();
    this.pendingRoomParticipants = new Map();
  }

  start() {
    this.server.on("upgrade", this.handleUpgrade.bind(this));
    this.wss.on("connection", this.handleConnection.bind(this));
    console.log(
      `[ws] upgrade handler ready maxUsersPerRoom=${this.maxUsersPerRoom}`
    );
  }

  handleUpgrade(req, socket, head) {
    const requestLog = this.getRequestLogContext(req, socket);
    console.log(
      `[ws upgrade] received url=${requestLog.url} remote=${requestLog.remoteAddress} host=${requestLog.host}`
    );

    const authResult = this.authenticator.authenticateUpgrade(req);
    if (!authResult.ok) {
      console.warn(
        `[ws upgrade] auth rejected status=${authResult.statusCode} message="${authResult.message}" url=${requestLog.url} remote=${requestLog.remoteAddress}`
      );
      this.rejectUpgrade(socket, authResult.statusCode, authResult.message);
      return;
    }

    const { travelDocId, userId } = authResult.session;
    console.log(
      `[ws upgrade] auth accepted userId=${userId} travelDocId=${travelDocId} url=${requestLog.url}`
    );

    const reservationResult = this.reserveRoomSlot(travelDocId, userId);
    console.log(
      `[ws upgrade] room reservation result ok=${reservationResult.ok} reserved=${reservationResult.reserved ?? false} userId=${userId} travelDocId=${travelDocId} activeUsers=${this.getRoomUserCount(travelDocId)} pendingUsers=${this.getPendingRoomUserCount(travelDocId)}`
    );

    if (!reservationResult.ok) {
      console.warn(
        `[ws upgrade] room rejected maxUsersPerRoom=${this.maxUsersPerRoom} userId=${userId} travelDocId=${travelDocId}`
      );
      this.rejectUpgrade(
        socket,
        403,
        `Room user limit exceeded (max ${this.maxUsersPerRoom} users per room)`
      );
      return;
    }
    if (!this.authenticator.consumeSecondaryToken(authResult.secondaryToken)) {
      if (reservationResult.reserved) {
        this.releaseReservedRoomSlot(travelDocId, userId);
      }
      console.warn(
        `[ws upgrade] secondary token rejected as already used userId=${userId} travelDocId=${travelDocId}`
      );
      this.rejectUpgrade(socket, 401, "Secondary token already used");
      return;
    }
    console.log(
      `[ws upgrade] secondary token consumed userId=${userId} travelDocId=${travelDocId}`
    );

    let reservationSettled = false;
    const rollbackReservation = () => {
      if (reservationSettled || !reservationResult.reserved) {
        return;
      }
      reservationSettled = true;
      this.releaseReservedRoomSlot(travelDocId, userId);
      console.warn(
        `[ws upgrade] room reservation rolled back userId=${userId} travelDocId=${travelDocId} activeUsers=${this.getRoomUserCount(travelDocId)} pendingUsers=${this.getPendingRoomUserCount(travelDocId)}`
      );
    };
    const finalizeReservation = () => {
      if (reservationSettled) {
        return;
      }
      reservationSettled = true;
      socket.off("close", rollbackReservation);
      socket.off("error", rollbackReservation);
    };
    if (reservationResult.reserved) {
      socket.once("close", rollbackReservation);
      socket.once("error", rollbackReservation);
    }

    req.session = {
      ...authResult.session,
      hasReservedRoomSlot: reservationResult.reserved
    };
    try {
      this.wss.handleUpgrade(req, socket, head, ws => {
        finalizeReservation();
        console.log(
          `[ws upgrade] handshake accepted userId=${userId} travelDocId=${travelDocId} url=${requestLog.url}`
        );
        this.wss.emit("connection", ws, req);
      });
    } catch (error) {
      rollbackReservation();
      console.error(
        `[ws upgrade] handshake failed userId=${userId} travelDocId=${travelDocId} error=${error?.message ?? error}`
      );
      this.rejectUpgrade(socket, 500, "WebSocket handshake failed");
    }
  }

  handleConnection(ws, req) {
    const session = req.session;
    if (!session) {
      console.error("[ws connection] rejected because session is missing");
      ws.close(1011, "session missing");
      return;
    }

    const { userId, travelDocId, hasReservedRoomSlot } = session;
    if (hasReservedRoomSlot) {
      this.releaseReservedRoomSlot(travelDocId, userId);
    }
    this.addRoomParticipant(travelDocId, userId);
    this.addUserSession(userId, ws);
    console.log(
      `[ws connection] connected userId=${userId} travelDocId=${travelDocId} userSessions=${this.getUserSessionCount(userId)} activeUsers=${this.getRoomUserCount(travelDocId)}`
    );
    this.yWebSocketHandler.handleConnection(ws, req, session);

    ws.on("close", (code, reason) => {
      this.removeUserSession(userId, ws);
      this.removeRoomParticipant(travelDocId, userId);
      console.log(
        `[ws connection] closed userId=${userId} travelDocId=${travelDocId} code=${code} reason="${reason.toString()}" userSessions=${this.getUserSessionCount(userId)} activeUsers=${this.getRoomUserCount(travelDocId)}`
      );
    });

    ws.on("error", error => {
      console.error(
        `[ws connection] error userId=${userId} travelDocId=${travelDocId} error=${error?.message ?? error}`
      );
    });
  }

  reserveRoomSlot(travelDocId, userId) {
    const participants = this.roomParticipants.get(travelDocId);
    if (participants?.has(userId)) {
      return { ok: true, reserved: false };
    }

    if (!this.pendingRoomParticipants.has(travelDocId)) {
      this.pendingRoomParticipants.set(travelDocId, new Map());
    }
    const pendingParticipants = this.pendingRoomParticipants.get(travelDocId);

    const pendingCountForUser = pendingParticipants.get(userId);
    if (pendingCountForUser !== undefined) {
      pendingParticipants.set(userId, pendingCountForUser + 1);
      return { ok: true, reserved: true };
    }

    const activeUsers = participants?.size ?? 0;
    const pendingUsers = pendingParticipants.size;
    if (activeUsers + pendingUsers >= this.maxUsersPerRoom) {
      if (pendingParticipants.size === 0) {
        this.pendingRoomParticipants.delete(travelDocId);
      }
      return { ok: false };
    }

    pendingParticipants.set(userId, 1);
    return { ok: true, reserved: true };
  }

  releaseReservedRoomSlot(travelDocId, userId) {
    const pendingParticipants = this.pendingRoomParticipants.get(travelDocId);
    if (!pendingParticipants) {
      return;
    }

    const count = pendingParticipants.get(userId);
    if (count === undefined) {
      return;
    }

    if (count <= 1) {
      pendingParticipants.delete(userId);
    } else {
      pendingParticipants.set(userId, count - 1);
    }

    if (pendingParticipants.size === 0) {
      this.pendingRoomParticipants.delete(travelDocId);
    }
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

  getRoomUserCount(travelDocId) {
    return this.roomParticipants.get(travelDocId)?.size ?? 0;
  }

  getPendingRoomUserCount(travelDocId) {
    return this.pendingRoomParticipants.get(travelDocId)?.size ?? 0;
  }

  getUserSessionCount(userId) {
    return this.userSessions.get(userId)?.size ?? 0;
  }

  getRequestLogContext(req, socket) {
    return {
      url: this.sanitizeRequestUrl(req),
      host: req.headers.host ?? "-",
      remoteAddress:
        req.headers["x-forwarded-for"] ?? socket.remoteAddress ?? "-"
    };
  }

  sanitizeRequestUrl(req) {
    const host = req.headers.host ?? "localhost";
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (url.searchParams.has("secondaryToken")) {
        url.searchParams.set("secondaryToken", "[redacted]");
      }
      return `${url.pathname}${url.search}`;
    } catch {
      return req.url ?? "/";
    }
  }

  rejectUpgrade(socket, statusCode, message) {
    console.warn(`[ws upgrade] responding status=${statusCode} message="${message}"`);

    let statusText = "Internal Server Error";
    if (statusCode === 400) {
      statusText = "Bad Request";
    } else if (statusCode === 401) {
      statusText = "Unauthorized";
    } else if (statusCode === 403) {
      statusText = "Forbidden";
    }

    const body = `${message}\n`;
    socket.end(
      `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        `\r\n${body}`
    );
  }
}
