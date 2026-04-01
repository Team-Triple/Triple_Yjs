import jwt from "jsonwebtoken";

export class SecondaryTokenAuthenticator {
  constructor({ secondaryJwtSecret }) {
    this.secondaryJwtSecret = secondaryJwtSecret;
    this.usedSecondaryTokens = new Map();
    this.fallbackUsedTokenTtlMs = 10 * 1000;
  }

  authenticateUpgrade(req) {
    if (!this.secondaryJwtSecret) {
      return {
        ok: false,
        statusCode: 500,
        message: "SECONDARY_JWT_SECRET is not set"
      };
    }

    const tokenResult = this.extractToken(req);
    if (!tokenResult.ok) {
      return { ok: false, statusCode: 401, message: tokenResult.message };
    }
    if (this.isSecondaryTokenUsed(tokenResult.token)) {
      return { ok: false, statusCode: 401, message: "Secondary token already used" };
    }

    let payload;
    try {
      payload = jwt.verify(tokenResult.token, this.secondaryJwtSecret);
    } catch {
      return { ok: false, statusCode: 401, message: "Invalid secondary token" };
    }

    const rawUserId = payload?.userId;
    if (typeof rawUserId !== "string" && typeof rawUserId !== "number") {
      return {
        ok: false,
        statusCode: 401,
        message: "Secondary token must include userId"
      };
    }

    const rawTravelDocId = this.extractTravelDocId(req);
    if (!rawTravelDocId) {
      return {
        ok: false,
        statusCode: 400,
        message: "Missing travelItineraryId query parameter"
      };
    }

    const userId = String(rawUserId);
    const travelDocId = rawTravelDocId;

    return {
      ok: true,
      secondaryToken: {
        value: tokenResult.token,
        expiresAtMs: this.resolveSecondaryTokenExpiryMs(payload)
      },
      session: {
        userId,
        travelDocId
      }
    };
  }

  extractToken(req) {
    const secondaryToken = this.getRequestUrl(req).searchParams.get("secondaryToken");
    if (!secondaryToken) {
      return { ok: false, message: "Missing secondaryToken query parameter" };
    }

    const normalizedSecondaryToken = secondaryToken.trim();
    const [scheme, token] = normalizedSecondaryToken.split(/\s+/, 2);
    if (!/^Bearer$/i.test(scheme) || !token) {
      return {
        ok: false,
        message: "secondaryToken must use Bearer format (Bearer {jwt})"
      };
    }

    return { ok: true, token };
  }

  extractTravelDocId(req) {
    const travelItineraryId = this.getRequestUrl(req).searchParams.get("travelItineraryId");
    if (!travelItineraryId) {
      return null;
    }

    const normalizedTravelItineraryId = travelItineraryId.trim();
    if (!normalizedTravelItineraryId) {
      return null;
    }

    return normalizedTravelItineraryId;
  }

  isSecondaryTokenUsed(token) {
    this.pruneUsedSecondaryTokens();
    return this.usedSecondaryTokens.has(token);
  }

  consumeSecondaryToken(secondaryToken) {
    if (!secondaryToken || typeof secondaryToken.value !== "string" || !secondaryToken.value) {
      return false;
    }

    this.pruneUsedSecondaryTokens();
    if (this.usedSecondaryTokens.has(secondaryToken.value)) {
      return false;
    }

    const fallbackExpiresAtMs = Date.now() + this.fallbackUsedTokenTtlMs;
    const expiresAtMs =
      typeof secondaryToken.expiresAtMs === "number"
        ? secondaryToken.expiresAtMs
        : fallbackExpiresAtMs;
    this.usedSecondaryTokens.set(secondaryToken.value, expiresAtMs);
    return true;
  }

  resolveSecondaryTokenExpiryMs(payload) {
    if (typeof payload?.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
    return Date.now() + this.fallbackUsedTokenTtlMs;
  }

  pruneUsedSecondaryTokens() {
    const now = Date.now();
    for (const [token, expiresAtMs] of this.usedSecondaryTokens.entries()) {
      if (expiresAtMs <= now) {
        this.usedSecondaryTokens.delete(token);
      }
    }
  }

  getRequestUrl(req) {
    const host = req.headers.host ?? "localhost";
    return new URL(req.url ?? "/", `http://${host}`);
  }
}
