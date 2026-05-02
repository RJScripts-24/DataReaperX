# Central Gmail Sender — Full Implementation Prompt

## Project Overview
Datareaper is a privacy agent platform that sends opt-out and data removal 
requests to data brokers on behalf of users. Currently all outbound emails 
go through each user's own Gmail account via per-user OAuth tokens.

We are replacing this with a single central Gmail account (owned by us) 
for all outbound opt-out emails to brokers. The per-user OAuth flow is 
used ONLY for reading the user's inbox (to catch broker replies) and must 
remain 100% untouched.

## Codebase Structure (relevant files only)
backend/
├── src/datareaper/
│   ├── core/
│   │   ├── config.py          ← add 4 new sender env vars
│   │   ├── exceptions.py      ← reference for custom exception patterns
│   │   └── logging.py         ← reference for logging patterns
│   ├── comms/
│   │   ├── gmail_client.py    ← add get_sender_service() only
│   │   ├── oauth.py           ← DO NOT TOUCH
│   │   ├── sync.py            ← DO NOT TOUCH
│   │   ├── outbound_dispatcher.py  ← update sending logic
│   │   ├── templates.py       ← add authorized agent header
│   │   └── dispatch_recipients.py  ← reference for how recipients are built
│   └── brokers/
│       ├── opt_out_rules.py   ← add sender_mode field handling
│       └── catalog.py         ← reference for broker data structures
├── data/
│   └── brokers/
│       └── broker_opt_out_rules.yaml  ← add sender_mode per broker
├── migrations/
│   └── versions/              ← no DB changes needed
├── .env.example               ← add 4 new vars
└── tests/
    └── comms/                 ← add new test file here

---

## Stage 1 — Environment & Configuration

### 1.1 backend/.env.example

Find the existing GMAIL_* block and add the four new vars directly 
below it. Do not move or rename existing vars.

BEFORE:
GMAIL_OAUTH_CLIENT_ID=your-oauth-client-id
GMAIL_OAUTH_CLIENT_SECRET=your-oauth-client-secret

AFTER:
GMAIL_OAUTH_CLIENT_ID=your-oauth-client-id
GMAIL_OAUTH_CLIENT_SECRET=your-oauth-client-secret
Central sender account — used for all outbound opt-out emails to brokers
Generate the refresh token once via OAuth consent for your central account
then store it here. This never changes unless you revoke access.
GMAIL_SENDER_CLIENT_ID=your-sender-client-id
GMAIL_SENDER_CLIENT_SECRET=your-sender-client-secret
GMAIL_SENDER_REFRESH_TOKEN=your-sender-refresh-token
GMAIL_SENDER_EMAIL=agent@yourdomain.com

### 1.2 backend/src/datareaper/core/config.py

Read the existing Settings class pattern carefully before editing.
Add four new optional fields following the exact same style as existing fields.

BEFORE (find the GMAIL section):
```python
class Settings(BaseSettings):
    ...
    gmail_oauth_client_id: str | None = None
    gmail_oauth_client_secret: str | None = None
    ...
```

AFTER:
```python
class Settings(BaseSettings):
    ...
    gmail_oauth_client_id: str | None = None
    gmail_oauth_client_secret: str | None = None

    # Central sender account for all outbound opt-out emails
    gmail_sender_client_id: str | None = None
    gmail_sender_client_secret: str | None = None
    gmail_sender_refresh_token: str | None = None
    gmail_sender_email: str | None = None
    ...
```

No other changes to config.py.

---

## Stage 2 — Startup Validation

### 2.1 backend/src/datareaper/core/config.py

After the Settings class definition (where other validators live, if any),
add a helper function that other modules can call to check sender readiness.
Do NOT raise on startup — just warn.

Add this function at the bottom of config.py after the settings 
instantiation:

```python
def validate_sender_config() -> bool:
    """
    Check all central sender credentials are present.
    Returns True if ready, False if not.
    Logs a warning if any are missing so ops can catch it early.
    Does NOT raise — app boots fine, sending will fail at call time.
    """
    from datareaper.core.logging import get_logger
    log = get_logger(__name__)

    required = [
        ("GMAIL_SENDER_CLIENT_ID", settings.gmail_sender_client_id),
        ("GMAIL_SENDER_CLIENT_SECRET", settings.gmail_sender_client_secret),
        ("GMAIL_SENDER_REFRESH_TOKEN", settings.gmail_sender_refresh_token),
        ("GMAIL_SENDER_EMAIL", settings.gmail_sender_email),
    ]
    missing = [name for name, val in required if not val]

    if missing:
        log.warning(
            "central_sender_not_configured",
            missing_vars=missing,
            message=(
                "Central Gmail sender credentials are incomplete. "
                "Outbound opt-out emails to brokers will fail at send time. "
                "Set the missing env vars to enable sending."
            ),
        )
        return False

    log.info(
        "central_sender_ready",
        sender_email=settings.gmail_sender_email,
    )
    return True
```

### 2.2 Application startup

Find where the app or worker boots (likely cli.py or the FastAPI app 
factory). Call validate_sender_config() at boot time.

Look for a pattern like:
```python
def create_app() -> FastAPI:
    ...
```
or
```python
@app.on_event("startup")
async def startup():
    ...
```

Add the call there:
```python
from datareaper.core.config import validate_sender_config
validate_sender_config()
```

---

## Stage 3 — Gmail Client

### File: backend/src/datareaper/comms/gmail_client.py

Read this file fully before editing. Understand how the existing 
get_user_service() or equivalent function builds its Google API service.
Then add get_sender_service() as a new standalone function below all 
existing code.

DO NOT modify any existing function. Only append.

```python
def get_sender_service() -> Resource:
    """
    Build and return a Gmail API service authenticated as the central
    sender account. Uses static credentials from env — no per-user
    token management needed.

    The refresh token is generated once manually via OAuth consent for
    the central account and stored in env. This function refreshes it
    to get a valid access token on every call.

    Raises:
        RuntimeError: if any GMAIL_SENDER_* env vars are missing.
        google.auth.exceptions.RefreshError: if the refresh token is
            invalid or has been revoked.
    """
    from datareaper.core.config import settings
    from datareaper.core.logging import get_logger

    log = get_logger(__name__)

    # Guard — fail loudly if credentials are not configured
    missing = [
        name for name, val in [
            ("GMAIL_SENDER_CLIENT_ID", settings.gmail_sender_client_id),
            ("GMAIL_SENDER_CLIENT_SECRET", settings.gmail_sender_client_secret),
            ("GMAIL_SENDER_REFRESH_TOKEN", settings.gmail_sender_refresh_token),
            ("GMAIL_SENDER_EMAIL", settings.gmail_sender_email),
        ]
        if not val
    ]
    if missing:
        raise RuntimeError(
            f"Cannot build central sender Gmail service. "
            f"Missing env vars: {', '.join(missing)}"
        )

    # Build static OAuth2 credentials from stored refresh token
    # token=None forces a refresh on first use
    creds = google.oauth2.credentials.Credentials(
        token=None,
        refresh_token=settings.gmail_sender_refresh_token,
        client_id=settings.gmail_sender_client_id,
        client_secret=settings.gmail_sender_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/gmail.send"],
    )

    # Refresh immediately to get a valid access token
    request = google.auth.transport.requests.Request()
    creds.refresh(request)

    log.debug(
        "sender_service_built",
        sender_email=settings.gmail_sender_email,
    )

    return googleapiclient.discovery.build(
        "gmail",
        "v1",
        credentials=creds,
        cache_discovery=False,
    )
```

Imports to add at the top of gmail_client.py (if not already present):
```python
import google.auth.transport.requests
import google.oauth2.credentials
import googleapiclient.discovery
from googleapiclient.discovery import Resource
```

---

## Stage 4 — Broker Opt-Out Rules

### 4.1 backend/data/brokers/broker_opt_out_rules.yaml

Read this file fully. Each broker entry likely has fields like:
method, url, notes, etc.

Add a new field `sender_mode` to each broker entry. This controls which 
sending strategy the dispatcher will use for that broker.

Valid values:
- `central`   → use our central Gmail sender (default for most brokers)
- `user_oauth` → must use the user's own Gmail account (strict brokers)

Example structure after change:
```yaml
brokers:
  - id: spokeo
    name: Spokeo
    opt_out_method: email
    sender_mode: central        # accepts authorized agent emails
    contact_email: optout@spokeo.com
    notes: Accepts third-party authorized agent requests

  - id: beenverified
    name: BeenVerified
    opt_out_method: email
    sender_mode: user_oauth     # requires matching email address
    contact_email: privacy@beenverified.com
    notes: Strict matching — must come from user's own email

  - id: whitepages
    name: Whitepages
    opt_out_method: email
    sender_mode: central
    contact_email: support@whitepages.com
    notes: Accepts authorized agent requests
```

Go through every existing broker entry and add sender_mode.
Default to `central` unless you have specific knowledge the broker 
requires a matching email. Brokers known to require user_oauth:
- BeenVerified
- Spokeo (web form only, email may not work)
- PeopleFinders

### 4.2 backend/src/datareaper/brokers/opt_out_rules.py

Read this file fully. Find the dataclass or model that represents a 
broker's opt-out rule. Add the new sender_mode field.

BEFORE:
```python
@dataclass
class BrokerOptOutRule:
    broker_id: str
    opt_out_method: str
    contact_email: str | None = None
    notes: str | None = None
    ...
```

AFTER:
```python
from typing import Literal

SenderMode = Literal["central", "user_oauth"]

@dataclass
class BrokerOptOutRule:
    broker_id: str
    opt_out_method: str
    contact_email: str | None = None
    notes: str | None = None
    sender_mode: SenderMode = "central"  # default to central sender
    ...
```

Find wherever the YAML is loaded into this dataclass/model and ensure 
sender_mode is parsed from YAML. It should work automatically if using 
dacite or pydantic. If manual mapping, add:
```python
sender_mode=raw.get("sender_mode", "central"),
```

---

## Stage 5 — Email Templates

### File: backend/src/datareaper/comms/templates.py

Read this file fully before editing. Understand how templates are 
currently structured (likely functions that return str or MIMEText).

#### 5.1 Add authorized agent header builder

Add this function near the top of the template helpers section:

```python
def build_authorized_agent_header(
    user_full_name: str,
    user_email: str,
) -> str:
    """
    Returns the standardized authorized agent disclosure block that must
    be prepended to every outbound opt-out email sent via the central
    sender account.

    This establishes legal standing for the request under CCPA, GDPR,
    and similar privacy regulations that recognize authorized agents.
    """
    return (
        "This request is submitted by an authorized privacy agent acting "
        "on behalf of the data subject identified below. The data subject "
        "has explicitly authorized this agent to submit privacy and data "
        "removal requests on their behalf.\n\n"
        "--- Data Subject Information ---\n"
        f"Full Name:     {user_full_name}\n"
        f"Email Address: {user_email}\n"
        "--------------------------------\n\n"
    )
```

#### 5.2 Update existing opt-out email template functions

For every function in templates.py that builds an opt-out email body:
- Add `user_full_name: str` and `user_email: str` parameters if not present
- Prepend `build_authorized_agent_header(user_full_name, user_email)` 
  to the returned body string

Example pattern:

BEFORE:
```python
def build_opt_out_email(broker_name: str, ...) -> str:
    return f"""
Dear {broker_name} Privacy Team,

I am writing to request removal of my personal data...
    """
```

AFTER:
```python
def build_opt_out_email(
    broker_name: str,
    user_full_name: str,
    user_email: str,
    ...,
) -> str:
    header = build_authorized_agent_header(user_full_name, user_email)
    return header + f"""
Dear {broker_name} Privacy Team,

I am writing to request the removal of personal data belonging to the 
data subject identified above...
    """
```

Apply this pattern to ALL opt-out template functions. Do not change 
any templates that are not opt-out related (e.g. platform notification 
emails, report emails — those stay as-is).

---

## Stage 6 — Outbound Dispatcher

### File: backend/src/datareaper/comms/outbound_dispatcher.py

This is the most critical file. Read it fully and understand the 
complete flow before making any change.

#### 6.1 New imports to add at the top

```python
from datareaper.comms.gmail_client import get_sender_service
from datareaper.brokers.opt_out_rules import SenderMode
from datareaper.core.config import settings
from datareaper.core.logging import get_logger

log = get_logger(__name__)
```

#### 6.2 Add sender resolution helper

Add this function before the main dispatch function:

```python
def _resolve_gmail_service(
    sender_mode: SenderMode,
    user_gmail_service,  # type matches existing per-user service type
):
    """
    Return the correct Gmail service based on the broker's sender_mode.

    - central:    use our central sender account (agent@yourdomain.com)
    - user_oauth: use the user's own Gmail service (passed in)

    Logs which mode is being used for observability.
    """
    if sender_mode == "central":
        log.debug("using_central_sender")
        return get_sender_service()
    else:
        log.debug("using_user_oauth_sender")
        return user_gmail_service
```

#### 6.3 Update the main send function

Find the function that actually sends the email (likely something like 
send_opt_out_email, dispatch, or similar). Update it to:

1. Accept sender_mode as a parameter (or derive it from the broker rule)
2. Call _resolve_gmail_service to get the right service
3. Set From and Reply-To headers correctly
4. Pass user_full_name and user_email to the template builder

BEFORE pattern:
```python
def send_opt_out_email(
    user_gmail_service,
    broker: BrokerOptOutRule,
    user_email: str,
    ...
) -> None:
    body = build_opt_out_email(broker.name, ...)
    
    msg = MIMEText(body)
    msg['To'] = broker.contact_email
    msg['From'] = user_email
    msg['Subject'] = f"Data Removal Request"

    service = user_gmail_service
    service.users().messages().send(
        userId='me',
        body={'raw': base64.urlsafe_b64encode(msg.as_bytes()).decode()}
    ).execute()
```

AFTER pattern:
```python
def send_opt_out_email(
    user_gmail_service,
    broker: BrokerOptOutRule,
    user_email: str,
    user_full_name: str,
    ...
) -> None:
    # Resolve which Gmail service to use based on broker requirements
    service = _resolve_gmail_service(
        sender_mode=broker.sender_mode,
        user_gmail_service=user_gmail_service,
    )

    # Determine From address based on sender mode
    from_address = (
        settings.gmail_sender_email
        if broker.sender_mode == "central"
        else user_email
    )

    # Build email body with authorized agent header
    body = build_opt_out_email(
        broker_name=broker.name,
        user_full_name=user_full_name,
        user_email=user_email,
        ...
    )

    msg = MIMEMultipart()
    msg['To'] = broker.contact_email
    msg['From'] = from_address
    msg['Reply-To'] = user_email      # broker replies go to user
    msg['Subject'] = f"Data Removal Request — {user_full_name}"

    msg.attach(MIMEText(body, 'plain'))

    log.info(
        "sending_opt_out_email",
        broker_id=broker.broker_id,
        sender_mode=broker.sender_mode,
        from_address=from_address,
        reply_to=user_email,
        to=broker.contact_email,
    )

    service.users().messages().send(
        userId='me',
        body={'raw': base64.urlsafe_b64encode(msg.as_bytes()).decode()}
    ).execute()
```

#### 6.4 Imports to add/verify in outbound_dispatcher.py

```python
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
```

#### 6.5 What NOT to change

- Do not change any retry logic or error handling wrappers
- Do not change how the dispatcher receives its Celery/ARQ task input
- Do not change inbound email processing paths
- Do not remove user_gmail_service parameter — it is still needed 
  for user_oauth mode brokers

---

## Stage 7 — Tests

### New file: backend/tests/comms/test_central_sender.py

Create this file from scratch following the existing test patterns in 
the tests/ directory (check conftest.py for fixtures).

```python
"""
Tests for central Gmail sender implementation.
Covers: get_sender_service, outbound_dispatcher sender routing,
email header correctness, and authorized agent template header.
"""

import pytest
from unittest.mock import MagicMock, patch

# ── Stage 7.1: get_sender_service ────────────────────────────────────────────

class TestGetSenderService:

    def test_builds_service_when_all_vars_present(self):
        """Happy path — all four env vars set, service builds successfully."""
        with patch("datareaper.core.config.settings") as mock_settings:
            mock_settings.gmail_sender_client_id = "client-id"
            mock_settings.gmail_sender_client_secret = "client-secret"
            mock_settings.gmail_sender_refresh_token = "refresh-token"
            mock_settings.gmail_sender_email = "agent@test.com"

            with patch("google.oauth2.credentials.Credentials") as mock_creds, \
                 patch("google.auth.transport.requests.Request"), \
                 patch("googleapiclient.discovery.build") as mock_build:

                mock_creds.return_value.refresh = MagicMock()
                mock_build.return_value = MagicMock()

                from datareaper.comms.gmail_client import get_sender_service
                service = get_sender_service()

                mock_build.assert_called_once_with(
                    "gmail", "v1",
                    credentials=mock_creds.return_value,
                    cache_discovery=False,
                )
                assert service is not None

    @pytest.mark.parametrize("missing_var", [
        "gmail_sender_client_id",
        "gmail_sender_client_secret",
        "gmail_sender_refresh_token",
        "gmail_sender_email",
    ])
    def test_raises_runtime_error_when_var_missing(self, missing_var):
        """Any missing var should raise RuntimeError with a clear message."""
        base = {
            "gmail_sender_client_id": "client-id",
            "gmail_sender_client_secret": "client-secret",
            "gmail_sender_refresh_token": "refresh-token",
            "gmail_sender_email": "agent@test.com",
        }
        base[missing_var] = None

        with patch("datareaper.core.config.settings") as mock_settings:
            for k, v in base.items():
                setattr(mock_settings, k, v)

            from datareaper.comms.gmail_client import get_sender_service
            with pytest.raises(RuntimeError, match="Missing env vars"):
                get_sender_service()


# ── Stage 7.2: Sender routing in dispatcher ──────────────────────────────────

class TestSenderResolution:

    def test_central_mode_uses_sender_service(self):
        """sender_mode=central should call get_sender_service, not user service."""
        from datareaper.comms.outbound_dispatcher import _resolve_gmail_service

        mock_user_service = MagicMock()
        mock_sender_service = MagicMock()

        with patch(
            "datareaper.comms.outbound_dispatcher.get_sender_service",
            return_value=mock_sender_service
        ):
            result = _resolve_gmail_service("central", mock_user_service)

        assert result is mock_sender_service
        mock_user_service.assert_not_called()

    def test_user_oauth_mode_uses_user_service(self):
        """sender_mode=user_oauth should use the passed user service directly."""
        from datareaper.comms.outbound_dispatcher import _resolve_gmail_service

        mock_user_service = MagicMock()

        with patch("datareaper.comms.outbound_dispatcher.get_sender_service") \
             as mock_sender:
            result = _resolve_gmail_service("user_oauth", mock_user_service)

        assert result is mock_user_service
        mock_sender.assert_not_called()


# ── Stage 7.3: Email headers ──────────────────────────────────────────────────

class TestEmailHeaders:

    def _make_broker_rule(self, sender_mode="central"):
        from datareaper.brokers.opt_out_rules import BrokerOptOutRule
        return BrokerOptOutRule(
            broker_id="test-broker",
            opt_out_method="email",
            contact_email="optout@testbroker.com",
            sender_mode=sender_mode,
        )

    def test_central_mode_sets_from_to_sender_email(self):
        """From header must be GMAIL_SENDER_EMAIL when sender_mode=central."""
        broker = self._make_broker_rule(sender_mode="central")
        sent_messages = []

        with patch("datareaper.comms.outbound_dispatcher.get_sender_service") \
             as mock_service, \
             patch("datareaper.core.config.settings") as mock_settings:

            mock_settings.gmail_sender_email = "agent@datareaper.io"

            def capture_send(**kwargs):
                sent_messages.append(kwargs)
                return {"id": "msg123"}

            mock_service.return_value.users.return_value \
                .messages.return_value.send.return_value \
                .execute.side_effect = capture_send

            from datareaper.comms.outbound_dispatcher import send_opt_out_email
            send_opt_out_email(
                user_gmail_service=MagicMock(),
                broker=broker,
                user_email="jane@gmail.com",
                user_full_name="Jane Smith",
            )

        # Decode the raw message and check From header
        import base64
        from email import message_from_bytes
        raw = sent_messages[0]['body']['raw']
        msg = message_from_bytes(base64.urlsafe_b64decode(raw))
        assert msg['From'] == "agent@datareaper.io"

    def test_reply_to_is_always_user_email(self):
        """Reply-To must always be the user's real email regardless of mode."""
        broker = self._make_broker_rule(sender_mode="central")
        sent_messages = []

        with patch("datareaper.comms.outbound_dispatcher.get_sender_service") \
             as mock_service, \
             patch("datareaper.core.config.settings") as mock_settings:

            mock_settings.gmail_sender_email = "agent@datareaper.io"

            mock_service.return_value.users.return_value \
                .messages.return_value.send.return_value \
                .execute.return_value = {"id": "msg123"}

            from datareaper.comms.outbound_dispatcher import send_opt_out_email
            send_opt_out_email(
                user_gmail_service=MagicMock(),
                broker=broker,
                user_email="jane@gmail.com",
                user_full_name="Jane Smith",
            )

        import base64
        from email import message_from_bytes
        raw = sent_messages[0]['body']['raw']
        msg = message_from_bytes(base64.urlsafe_b64decode(raw))
        assert msg['Reply-To'] == "jane@gmail.com"


# ── Stage 7.4: Authorized agent template header ───────────────────────────────

class TestAuthorizedAgentHeader:

    def test_header_contains_user_name(self):
        from datareaper.comms.templates import build_authorized_agent_header
        header = build_authorized_agent_header("Jane Smith", "jane@gmail.com")
        assert "Jane Smith" in header

    def test_header_contains_user_email(self):
        from datareaper.comms.templates import build_authorized_agent_header
        header = build_authorized_agent_header("Jane Smith", "jane@gmail.com")
        assert "jane@gmail.com" in header

    def test_header_contains_agent_disclosure(self):
        from datareaper.comms.templates import build_authorized_agent_header
        header = build_authorized_agent_header("Jane Smith", "jane@gmail.com")
        assert "authorized privacy agent" in header.lower()

    def test_opt_out_template_prepends_header(self):
        """Full opt-out email body must start with the agent header."""
        from datareaper.comms.templates import build_opt_out_email
        body = build_opt_out_email(
            broker_name="TestBroker",
            user_full_name="Jane Smith",
            user_email="jane@gmail.com",
        )
        assert "authorized privacy agent" in body.lower()
        assert "Jane Smith" in body
        # Header must appear before the main body content
        header_pos = body.lower().find("authorized privacy agent")
        body_pos = body.lower().find("dear")
        assert header_pos < body_pos
```

---

## Stage 8 — Existing OAuth Flow Regression Check

After all changes are made, verify these files are completely unchanged 
by diffing against the original:

- comms/oauth.py           → zero changes allowed
- comms/sync.py            → zero changes allowed
- comms/gmail_client.py    → only additions, no modifications to 
                             existing functions

Run the existing test suite in full to confirm nothing broke:
```bash
cd backend && pytest tests/ -v --tb=short
```

Any failures in existing comms tests must be investigated and fixed 
before this implementation is considered complete.

---

## Definition of Done Checklist

### Config & Env
- [ ] Four GMAIL_SENDER_* vars added to .env.example with comments
- [ ] Four fields added to Settings class in config.py
- [ ] validate_sender_config() added to config.py
- [ ] validate_sender_config() called at application startup

### Gmail Client  
- [ ] get_sender_service() added to gmail_client.py
- [ ] Raises RuntimeError if any var is missing
- [ ] Uses correct Gmail send scope
- [ ] Refreshes credentials before returning service
- [ ] No existing functions modified

### Broker Rules
- [ ] sender_mode field added to every broker in broker_opt_out_rules.yaml
- [ ] SenderMode type added to opt_out_rules.py
- [ ] sender_mode parsed from YAML correctly
- [ ] Strict brokers set to user_oauth

### Templates
- [ ] build_authorized_agent_header() added to templates.py
- [ ] All opt-out templates prepend the header
- [ ] Non opt-out templates unchanged

### Dispatcher
- [ ] _resolve_gmail_service() added
- [ ] send_opt_out_email() uses resolved service
- [ ] From header set correctly per sender_mode
- [ ] Reply-To always set to user's real email
- [ ] user_full_name passed to template builder
- [ ] Structured logging on every send

### Tests
- [ ] test_central_sender.py created
- [ ] get_sender_service happy path passes
- [ ] get_sender_service missing var tests pass (one per var)
- [ ] central mode routing test passes
- [ ] user_oauth mode routing test passes
- [ ] From header test passes
- [ ] Reply-To header test passes
- [ ] Template header content tests pass
- [ ] Template prepend order test passes
- [ ] Full existing test suite passes with zero regressions