"""Security layer: slowapi in-memory rate limiting, request IDs, access logging, JWT (admin/analyst)."""
from __future__ import annotations

import contextvars
import hmac
import logging
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from limits import parse as parse_limit
from pydantic import BaseModel, ConfigDict, Field
from slowapi import Limiter
from starlette.middleware import Middleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .common import error

access_log = logging.getLogger("noorfinance.http")
security_log = logging.getLogger("noorfinance.security")

ROLES = ("admin", "analyst")
ALGORITHM = "HS256"
MIN_SECRET_LENGTH = 32
PLACEHOLDER_SECRETS = {"change_me", "changeme", "secret", "password"}
HEALTH_PATHS = {"/", "/health", "/api/health", "/api/v2/health"}
AUTH_PATHS = {"/api/v2/auth/token"}
REQUEST_ID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")

_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


def current_request_id() -> str:
    return _request_id.get()


def env_limit(name: str, default: str) -> str:
    """Read a '<count>/<period>' limit from the environment, falling back when malformed."""
    raw = os.environ.get(name, "").strip() or default
    try:
        parse_limit(raw)
        return raw
    except ValueError:
        security_log.warning("Ignoring invalid %s=%r; using %s", name, raw, default)
        return default


def extra_cors_origins() -> list[str]:
    """Origins from CORS_ORIGINS. A wildcard is never accepted."""
    items = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",")]
    return [o for o in items if o and re.match(r"^https?://[^\s*]+$", o)]


def _client_ip(scope: Scope) -> str:
    if os.environ.get("TRUST_PROXY", "").strip().lower() in ("1", "true", "yes"):
        for name, value in scope.get("headers", []):
            if name == b"x-forwarded-for":
                first = value.decode("latin-1").split(",")[0].strip()
                if first:
                    return first
    client = scope.get("client")
    return client[0] if client else "unknown"


class SecurityMiddleware:
    """Request ID + slowapi rate limiting + access log + friendly 500s, as one pure-ASGI layer."""

    def __init__(self, app: ASGIApp, v2_limit: Optional[str] = None, health_limit: Optional[str] = None,
                 auth_limit: Optional[str] = None) -> None:
        self.app = app
        self.limiter = Limiter(key_func=lambda request: "", storage_uri="memory://", strategy="fixed-window")
        self.limits = {
            "v2": parse_limit(v2_limit or env_limit("RATE_LIMIT", "60/minute")),
            "health": parse_limit(health_limit or env_limit("RATE_LIMIT_HEALTH", "200/minute")),
            "auth": parse_limit(auth_limit or env_limit("RATE_LIMIT_AUTH", "10/minute")),
        }

    @staticmethod
    def _bucket(path: str) -> Optional[str]:
        if path in AUTH_PATHS:
            return "auth"
        if path in HEALTH_PATHS:
            return "health"
        if path.startswith("/api/v2/"):
            return "v2"
        return None

    def _hit(self, bucket: str, ip: str) -> tuple[bool, list[tuple[bytes, bytes]], int]:
        item = self.limits[bucket]
        allowed = self.limiter._limiter.hit(item, bucket, ip)
        stats = self.limiter._limiter.get_window_stats(item, bucket, ip)
        retry = max(1, int(stats.reset_time - time.time()) + 1)
        headers = [
            (b"x-ratelimit-limit", str(item.amount).encode()),
            (b"x-ratelimit-remaining", str(max(0, stats.remaining)).encode()),
            (b"x-ratelimit-reset", str(int(stats.reset_time)).encode()),
        ]
        return allowed, headers, retry

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = next((v.decode("latin-1") for k, v in scope.get("headers", []) if k == b"x-request-id"), "")
        rid = incoming if REQUEST_ID_RE.match(incoming) else str(uuid.uuid4())
        token = _request_id.set(rid)
        started = time.perf_counter()
        method, path = scope["method"], scope["path"]
        state = {"status": 500, "started": False}
        extra: list[tuple[bytes, bytes]] = [(b"x-request-id", rid.encode())]

        def plain() -> dict[str, str]:
            return {k.decode(): v.decode() for k, v in extra}

        try:
            bucket = self._bucket(path) if method != "OPTIONS" else None
            if bucket:
                allowed, rate_headers, retry = self._hit(bucket, _client_ip(scope))
                extra += rate_headers
                if not allowed:
                    state["status"] = 429
                    body = {"error": "rate_limited",
                            "message": f"Too many requests. Please retry in {retry} seconds.",
                            "details": [f"Limit: {self.limits[bucket]}"]}
                    resp = JSONResponse(body, status_code=429, headers={**plain(), "Retry-After": str(retry)})
                    await resp(scope, receive, send)
                    return

            async def send_wrapper(message: Message) -> None:
                if message["type"] == "http.response.start":
                    state["status"] = message["status"]
                    state["started"] = True
                    message["headers"] = list(message.get("headers", [])) + extra
                await send(message)

            try:
                await self.app(scope, receive, send_wrapper)
            except Exception:
                access_log.exception("rid=%s unhandled error on %s %s", rid, method, path)
                if not state["started"]:
                    state["status"] = 500
                    resp = JSONResponse(
                        {"error": "internal_error",
                         "message": "The service could not complete the request. Please try again shortly.",
                         "request_id": rid}, status_code=500, headers=plain())
                    await resp(scope, receive, send)
        finally:
            access_log.info("rid=%s %s %s -> %s in %.1fms", rid, method, path, state["status"],
                            (time.perf_counter() - started) * 1000.0)
            _request_id.reset(token)


def install(app: FastAPI, **limits: str) -> None:
    """Install the middleware innermost (inside CORS) so preflights are never rate limited
    and 429 responses still carry CORS headers."""
    app.user_middleware.append(Middleware(SecurityMiddleware, **limits))
    app.middleware_stack = None  # force a rebuild on the next request


# --------------------------------------------------------------------------
# JWT auth (demo tokens, roles: admin / analyst)
# --------------------------------------------------------------------------
NOT_CONFIGURED = ("Authentication is not configured on this server. "
                  "Set a strong JWT_SECRET (32+ characters) and restart the service.")
ENGINE_SPEEDUP = "64x"  # measured: 30y monthly instrument, V1 vs V2 (python -m backend.v2.profile_report)
API_VERSION = "2.0.0"

router = APIRouter()


def jwt_secret() -> Optional[str]:
    secret = os.environ.get("JWT_SECRET", "").strip()
    if len(secret) < MIN_SECRET_LENGTH or secret.lower() in PLACEHOLDER_SECRETS:
        return None
    return secret


def _unauthorized(message: str) -> JSONResponse:
    resp = error(401, [message], "unauthorized")
    resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


def issue_token(subject: str, role: str, secret: str) -> tuple[str, int]:
    ttl = 60
    try:
        ttl = max(1, min(int(os.environ.get("JWT_TTL_MINUTES", "60")), 24 * 60))
    except ValueError:
        security_log.warning("Ignoring invalid JWT_TTL_MINUTES; using 60")
    now = datetime.now(timezone.utc)
    claims = {"sub": subject, "role": role, "iat": now, "exp": now + timedelta(minutes=ttl),
              "jti": str(uuid.uuid4())}
    return jwt.encode(claims, secret, algorithm=ALGORITHM), ttl * 60


def authenticate(request: Request) -> tuple[Optional[dict], Optional[JSONResponse]]:
    """Optional auth: no header -> (None, None) and a log line; bad header/token -> 401."""
    header = request.headers.get("authorization")
    if not header:
        security_log.info("rid=%s unauthenticated access to %s", current_request_id(), request.url.path)
        return None, None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None, _unauthorized("Authorization header must be 'Bearer <token>'")
    secret = jwt_secret()
    if secret is None:
        return None, error(500, [NOT_CONFIGURED], "auth_not_configured")
    try:
        claims = jwt.decode(token.strip(), secret, algorithms=[ALGORITHM],
                            options={"require": ["exp", "sub", "role"]})
    except jwt.ExpiredSignatureError:
        return None, _unauthorized("Your access token has expired; request a new one")
    except jwt.PyJWTError:
        return None, _unauthorized("The access token is invalid")
    if claims.get("role") not in ROLES:
        return None, _unauthorized("The access token carries an unknown role")
    security_log.info("rid=%s authenticated %s (%s) on %s", current_request_id(), claims["sub"],
                      claims["role"], request.url.path)
    return claims, None


class TokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(..., strict=True, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.@-]+$")
    role: str = Field("analyst", strict=True)
    password: Optional[str] = Field(None, strict=True, max_length=128)


@router.post("/auth/token")
async def create_token(request: Request) -> Any:
    from .common import read_json, validate

    secret = jwt_secret()
    if secret is None:
        security_log.error("JWT_SECRET is missing, too short or a placeholder")
        return error(500, [NOT_CONFIGURED], "auth_not_configured")
    body, err = await read_json(request)
    if err:
        return err
    req, err = validate(TokenRequest, body)
    if err:
        return err
    if req.role not in ROLES:
        return error(400, ["Role must be one of: admin, analyst"])
    if req.role == "admin":
        expected = os.environ.get("DEMO_ADMIN_PASSWORD", "")
        if not expected:
            return error(403, ["Admin tokens are disabled on this server"], "forbidden")
        if not hmac.compare_digest((req.password or "").encode(), expected.encode()):
            security_log.warning("rid=%s failed admin token request for %s", current_request_id(), req.username)
            return error(403, ["Invalid admin credentials"], "forbidden")
    token, expires_in = issue_token(req.username, req.role, secret)
    return {"access_token": token, "token_type": "bearer", "expires_in": expires_in, "role": req.role,
            "note": "Demo token for evaluation; not a substitute for production identity management."}


@router.get("/auth/me")
async def whoami(request: Request) -> Any:
    claims, err = authenticate(request)
    if err:
        return err
    if claims is None:
        return _unauthorized("Sign in required: send 'Authorization: Bearer <token>'")
    return {"username": claims["sub"], "role": claims["role"],
            "expires_at": datetime.fromtimestamp(claims["exp"], timezone.utc).isoformat(timespec="seconds")}


def health_payload() -> dict:
    """Superset of the V1 health payload (``status`` stays ``ok`` for compatibility)."""
    from . import engine
    from .common import pricing_cache
    from .router import cache as advanced_cache

    started = time.perf_counter()
    try:
        probe = engine.value_instrument_v2(1000.0, 0.06, 0.05, 10.0, 2)
        v2_ok = abs(probe["price"] - 1077.94554) < 1e-3
    except Exception:
        security_log.exception("V2 health probe failed")
        v2_ok = False
    return {
        "status": "ok",
        "v2_status": "ok" if v2_ok else "degraded",
        "cache_size": len(advanced_cache) + len(pricing_cache),
        "version": API_VERSION,
        "engine_speedup": ENGINE_SPEEDUP,
        "calc_time_ms": round((time.perf_counter() - started) * 1000.0, 4),
    }


@router.get("/health")
async def v2_health() -> dict:
    return health_payload()
