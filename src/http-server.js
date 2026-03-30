// 서비스 상태와 클라이언트 접속 힌트를 반환하는 최소 HTTP 엔드포인트.
import { createServer } from "node:http";

export function createHttpServer(port) {
  return createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        websocket: `ws://localhost:${port}/travel-doc/{travelItineraryId}?token={jwt}`
      })
    );
  });
}
