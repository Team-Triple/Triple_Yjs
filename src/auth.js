// JWT 인증과 여행 문서 접근 검증을 위한 업그레이드 요청 파싱/검사 로직.
function getRequestUrl(req, port) {
  const host = req.headers.host ?? `localhost:${port}`;
  return new URL(req.url ?? "/", `http://${host}`);
}

function extractBearerToken(req, port) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    const [scheme, token] = authHeader.split(" ");
    if (/^Bearer$/i.test(scheme) && token) {
      return token;
    }
  }

  const tokenFromQuery = getRequestUrl(req, port).searchParams.get("token");
  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  return null;
}

function extractTravelItineraryId(req, port, travelDocPrefix) {
  const requestUrl = getRequestUrl(req, port);
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

export function rejectUpgrade(socket, statusCode, message) {
  const statusText =
    statusCode === 400
      ? "Bad Request"
      : statusCode === 401
        ? "Unauthorized"
        : statusCode === 403
          ? "Forbidden"
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

export function createAuthenticateUpgrade({
  port,
  jwtSecret,
  travelDocPrefix,
  jwt
}) {
  return function authenticateUpgrade(req) {
    if (!jwtSecret) {
      return { ok: false, statusCode: 500, message: "JWT_SECRET is not set" };
    }

    const token = extractBearerToken(req, port);
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

    const travelItineraryId = extractTravelItineraryId(req, port, travelDocPrefix);
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
  };
}
