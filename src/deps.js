// 모듈 전반에서 사용하는 CommonJS 패키지를 불러오는 브리지.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const utils = require("y-websocket/bin/utils");
export const jwt = require("jsonwebtoken");
export const Y = require("yjs");
export const { LeveldbPersistence } = require("y-leveldb");
