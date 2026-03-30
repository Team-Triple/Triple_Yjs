// 환경변수 기반 런타임 설정을 기본값과 함께 중앙에서 관리.
import { resolve } from "node:path";

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export const port = toPositiveInt(process.env.PORT ?? 1234, 1234);
export const jwtSecret = process.env.JWT_SECRET;
export const travelDocPrefix = "travel-doc";
export const maxUsersPerDoc = toPositiveInt(process.env.MAX_USERS_PER_DOC ?? 20, 20);
export const yLeveldbPath = resolve(process.env.Y_LEVELDB_PATH ?? ".data/y-leveldb");
