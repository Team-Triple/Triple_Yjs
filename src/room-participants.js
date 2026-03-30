// 문서별 최대 인원 제한을 적용하는 메모리 기반 room 참여자 추적기.
export function createRoomParticipants(maxUsersPerDoc) {
  const roomParticipants = new Map();

  function canJoin(docName, userId) {
    const participants = roomParticipants.get(docName);
    if (!participants) {
      return true;
    }
    if (participants.has(userId)) {
      return true;
    }
    return participants.size < maxUsersPerDoc;
  }

  function add(docName, userId) {
    if (!roomParticipants.has(docName)) {
      roomParticipants.set(docName, new Map());
    }
    const participants = roomParticipants.get(docName);
    const currentCount = participants.get(userId) ?? 0;
    participants.set(userId, currentCount + 1);
  }

  function remove(docName, userId) {
    const participants = roomParticipants.get(docName);
    if (!participants) {
      return;
    }

    const currentCount = participants.get(userId);
    if (currentCount === undefined) {
      return;
    }

    if (currentCount <= 1) {
      participants.delete(userId);
    } else {
      participants.set(userId, currentCount - 1);
    }

    if (participants.size === 0) {
      roomParticipants.delete(docName);
    }
  }

  return { canJoin, add, remove };
}
