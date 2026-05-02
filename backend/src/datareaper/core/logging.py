from __future__ import annotations

import logging
from typing import Any

try:
    import structlog
except Exception:  # pragma: no cover - local fallback
    structlog = None


_VALID_LOG_FORMATS = {"console", "json"}


def _resolve_log_format(log_format: str) -> str:
    normalized = str(log_format or "").strip().lower()
    if normalized in _VALID_LOG_FORMATS:
        return normalized
    return "console"


def _add_service_name(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    event_dict.setdefault("service", "datareaper-backend")
    return event_dict


def configure_logging(level: str = "INFO", log_format: str = "console") -> None:
    resolved_level = getattr(logging, level.upper(), logging.INFO)
    resolved_format = _resolve_log_format(log_format)

    if structlog is None:
        logging.basicConfig(
            level=resolved_level,
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
            force=True,
        )
        return

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        timestamper,
        _add_service_name,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    renderer: Any
    if resolved_format == "json":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=False)

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler()
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(resolved_level)

    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        std_logger = logging.getLogger(logger_name)
        std_logger.handlers.clear()
        std_logger.propagate = True
        std_logger.setLevel(resolved_level)

    structlog.reset_defaults()
    structlog.configure(
        processors=shared_processors + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        wrapper_class=structlog.make_filtering_bound_logger(resolved_level),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def bind_logging_context(**values: Any) -> None:
    if structlog is None:
        return
    cleaned = {key: value for key, value in values.items() if value is not None}
    if cleaned:
        structlog.contextvars.bind_contextvars(**cleaned)


def clear_logging_context() -> None:
    if structlog is None:
        return
    structlog.contextvars.clear_contextvars()


def get_logger(name: str):
    if structlog is not None:
        return structlog.get_logger(name)
    return logging.getLogger(name)
