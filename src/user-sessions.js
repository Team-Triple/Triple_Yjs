// 연결 생명주기 관리를 위한 메모리 기반 사용자-WebSocket 세션 레지스트리.
export function createUserSessions() {
  const userSessions = new Map();

  function add(userId, ws) {
    if (!userSessions.has(userId)) {
      userSessions.set(userId, new Set());
    }
    userSessions.get(userId).add(ws);
  }

  function remove(userId, ws) {
    const sessions = userSessions.get(userId);
    if (!sessions) {
      return;
    }

    sessions.delete(ws);
    if (sessions.size === 0) {
      userSessions.delete(userId);
    }
  }

  return { add, remove };
}
