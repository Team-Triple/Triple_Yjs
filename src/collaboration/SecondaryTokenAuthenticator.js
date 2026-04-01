import jwt from "jsonwebtoken";

export class SecondaryTokenAuthenticator {
  constructor({ secondaryJwtSecret }) {
    this.secondaryJwtSecret = secondaryJwtSecret;
  }

  authenticateUpgrade(req) {
    if (!this.secondaryJwtSecret) {
      return {
        ok: false,
        statusCode: 500,
        message: "SECONDARY_JWT_SECRET is not set"
      };
    }

    const token = this.extractToken(req);
    if (!token) {
      return { ok: false, statusCode: 401, message: "Missing secondary token" };
    }

    let payload;
    try {
      payload = jwt.verify(token, this.secondaryJwtSecret);
    } catch {
      return { ok: false, statusCode: 401, message: "Invalid secondary token" };
    }

    const rawUserId = payload?.userId;
    const rawTravelDocId = payload?.travelDocId ?? payload?.travelItineraryId;
    if (
      (typeof rawUserId !== "string" && typeof rawUserId !== "number") ||
      (typeof rawTravelDocId !== "string" && typeof rawTravelDocId !== "number")
    ) {
      return {
        ok: false,
        statusCode: 401,
        message: "Secondary token must include userId and travelDocId"
      };
    }

    const userId = String(rawUserId);
    const travelDocId = String(rawTravelDocId);

    return {
      ok: true,
      session: {
        userId,
        travelDocId
      }
    };
  }

  extractToken(req) {
    const tokenFromHeader = req.headers["x-secondary-token"];
    if (typeof tokenFromHeader === "string" && tokenFromHeader.trim()) {
      return tokenFromHeader.trim();
    }

    const authorization = req.headers.authorization;
    if (typeof authorization === "string") {
      const [scheme, token] = authorization.trim().split(/\s+/, 2);
      if (/^ST$/i.test(scheme) && token) {
        return token;
      }
    }

    const tokenFromQuery = this.getRequestUrl(req).searchParams.get("st");
    if (tokenFromQuery) {
      return tokenFromQuery;
    }

    return null;
  }

  getRequestUrl(req) {
    const host = req.headers.host ?? "localhost";
    return new URL(req.url ?? "/", `http://${host}`);
  }
}
