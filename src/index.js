// 설정, 영속화, 인증, WebSocket 서버 시작을 연결하는 부트스트랩 파일.
import {
  jwtSecret,
  maxUsersPerDoc,
  port,
  travelDocPrefix,
  yLeveldbPath
} from "./config.js";
import { utils, jwt, Y, LeveldbPersistence } from "./deps.js";
import { createAuthenticateUpgrade, rejectUpgrade } from "./auth.js";
import { createRoomParticipants } from "./room-participants.js";
import { createUserSessions } from "./user-sessions.js";
import { initializePersistence } from "./persistence.js";
import { createHttpServer } from "./http-server.js";
import { attachWebSocketServer } from "./ws-server.js";

await initializePersistence({
  utils,
  Y,
  LeveldbPersistence,
  yLeveldbPath
});

const authenticateUpgrade = createAuthenticateUpgrade({
  port,
  jwtSecret,
  travelDocPrefix,
  jwt
});

const userSessions = createUserSessions();
const roomParticipants = createRoomParticipants(maxUsersPerDoc);
const server = createHttpServer(port);

attachWebSocketServer({
  server,
  utils,
  authenticateUpgrade,
  rejectUpgrade,
  roomParticipants,
  userSessions,
  maxUsersPerDoc
});

server.listen(port, () => {
  console.log(`Yjs WebSocket server listening on ws://localhost:${port}`);
  console.log(`Y-LevelDB path: ${yLeveldbPath}`);
  console.log(
    `Connect format: ws://localhost:${port}/travel-doc/{travelItineraryId}?token={jwt}`
  );
});
