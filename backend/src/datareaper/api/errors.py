from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from datareaper.core.exceptions import DataReaperError, ResourceNotFoundError
from datareaper.core.logging import get_logger

logger = get_logger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ResourceNotFoundError)
    async def handle_not_found(request: Request, exc: ResourceNotFoundError) -> JSONResponse:
        logger.warning(
            "resource_not_found",
            method=request.method,
            path=request.url.path,
            detail=str(exc),
        )
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(DataReaperError)
    async def handle_app_error(request: Request, exc: DataReaperError) -> JSONResponse:
        logger.warning(
            "application_error",
            method=request.method,
            path=request.url.path,
            detail=str(exc),
        )
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.warning(
            "request_validation_error",
            method=request.method,
            path=request.url.path,
            errors=exc.errors(),
        )
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        logger.warning(
            "http_exception",
            method=request.method,
            path=request.url.path,
            status_code=exc.status_code,
            detail=exc.detail,
        )
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(SQLAlchemyError)
    async def handle_database_exception(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.error(
            "database_exception",
            method=request.method,
            path=request.url.path,
            error=str(exc),
        )
        return JSONResponse(status_code=503, content={"detail": "Database temporarily unavailable"})

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "unhandled_exception",
            method=request.method,
            path=request.url.path,
            error=str(exc),
        )
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
