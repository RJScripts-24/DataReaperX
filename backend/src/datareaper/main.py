from __future__ import annotations

from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse

from datareaper.api.errors import register_error_handlers
from datareaper.api.router import api_router, v1_router
from datareaper.api.websocket import router as websocket_router
from datareaper.core.config import get_settings
from datareaper.core.constants import API_PREFIX, V1_PREFIX, WS_PREFIX
from datareaper.core.logging import bind_logging_context, clear_logging_context, get_logger
from datareaper.lifespan import lifespan

settings = get_settings()
logger = get_logger(__name__)
app = FastAPI(title=settings.app_name, debug=settings.app_debug, lifespan=lifespan)


@app.middleware("http")
async def log_http_requests(request: Request, call_next):
    started = perf_counter()
    request_id = (
        request.headers.get("X-Request-Id")
        or request.headers.get("X-Correlation-Id")
        or f"req_{uuid4().hex[:16]}"
    )
    client_ip = request.client.host if request.client else None
    request.state.request_id = request_id

    bind_logging_context(request_id=request_id, method=request.method, path=request.url.path)

    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = round((perf_counter() - started) * 1000, 2)
        logger.exception(
            "http_request_unhandled_exception",
            status_code=500,
            duration_ms=duration_ms,
            client_ip=client_ip,
            error=str(exc),
        )
        error_response = JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "request_id": request_id,
            },
        )
        error_response.headers["X-Request-Id"] = request_id
        clear_logging_context()
        return error_response

    response.headers["X-Request-Id"] = request_id
    duration_ms = round((perf_counter() - started) * 1000, 2)
    payload = {
        "status_code": response.status_code,
        "duration_ms": duration_ms,
        "client_ip": client_ip,
    }

    if response.status_code >= 500:
        logger.error("http_request_completed", **payload)
    elif response.status_code >= 400:
        logger.warning(
            "http_request_completed",
            **payload,
        )
    else:
        logger.info("http_request_completed", **payload)

    clear_logging_context()
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.app_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Session-Id"],
)
app.include_router(api_router, prefix=API_PREFIX)
app.include_router(v1_router, prefix=V1_PREFIX)
app.include_router(websocket_router, prefix=WS_PREFIX)
app.include_router(websocket_router, prefix=V1_PREFIX)
register_error_handlers(app)


@app.get("/")
async def root() -> dict:
    return {"name": settings.app_name, "status": "ok"}
