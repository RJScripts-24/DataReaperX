from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect, status

from datareaper.api.realtime_tokens import get_realtime_claim, issue_realtime_claim
from datareaper.core.config import get_settings
from datareaper.schemas.api_v1 import (
    CreateRealtimeConnectionRequest,
    CreateRealtimeConnectionResponse,
)

from datareaper.realtime.event_bus import event_bus

router = APIRouter()


@router.post("/realtime/connection", response_model=CreateRealtimeConnectionResponse, status_code=201)
async def create_realtime_connection(
    payload: CreateRealtimeConnectionRequest,
    request: Request,
) -> CreateRealtimeConnectionResponse:
    settings = get_settings()
    connection_id, token, expires_at = issue_realtime_claim(
        scan_id=payload.scanId,
        channels=list(payload.channels),
        transport=payload.preferredTransport,
    )

    host_header = request.headers.get("host")
    if host_header:
        scheme = "wss" if request.url.scheme == "https" else "ws"
        endpoint = f"{scheme}://{host_header}/v1/realtime/ws"
    else:
        host = settings.app_host
        if host in {"0.0.0.0", "127.0.0.1"}:
            host = "localhost"

        scheme = "wss" if settings.app_env == "production" else "ws"
        endpoint = f"{scheme}://{host}:{settings.app_port}/v1/realtime/ws"

    return CreateRealtimeConnectionResponse(
        connectionId=connection_id,
        transport=payload.preferredTransport,
        endpoint=endpoint,
        token=token,
        expiresAt=expires_at,
    )


@router.websocket("/realtime/ws")
async def realtime_updates(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing realtime token")
        return

    claim = get_realtime_claim(token)
    if claim is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired realtime token")
        return

    await websocket.accept()
    channels = {claim.scan_id, f"scan:{claim.scan_id}", *claim.channels}
    for channel in channels:
        await event_bus.connect(channel, websocket)

    await websocket.send_json(
        {
            "event": "scans.lifecycle.updated",
            "occurredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "scanId": claim.scan_id,
            "payload": {"status": "connected", "connectionId": claim.connection_id},
        }
    )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        for channel in channels:
            await event_bus.disconnect(channel, websocket)


@router.websocket("/scans/{scan_id}")
async def scan_updates(websocket: WebSocket, scan_id: str) -> None:
    await websocket.accept()
    await event_bus.connect(scan_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await event_bus.disconnect(scan_id, websocket)
