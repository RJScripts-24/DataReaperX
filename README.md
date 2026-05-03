<div align="center">

<img src="frontend/public/images/logo.png" alt="DataReaper Logo" width="220"/>

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=72&duration=3000&pause=1000&color=8B85FF&center=true&vCenter=true&width=800&height=100&lines=DATAREAPER" alt="DataReaper" />

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=18&duration=4000&pause=800&color=A0A0B0&center=true&vCenter=true&multiline=false&width=700&height=40&lines=Autonomous+AI-Powered+Privacy+Defense+Platform;Hunt+Down+Your+Exposed+Data.+Force+Its+Deletion.;OSINT+%E2%80%A2+Identity+Graphs+%E2%80%A2+Legal+Automation+%E2%80%A2+Email+Warfare" alt="Tagline" />

<br/><br/>

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.116+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Latest-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Latest-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![License](https://img.shields.io/badge/License-MIT-8B85FF?style=for-the-badge)](LICENSE)

<br/>

> *Your data is exposed. Your identity is mapped. Take it back.*

<br/>

**[Features](#-features) • [Architecture](#-architecture) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started) • [API Docs](#-api-documentation) • [Screenshots](#-screenshots)**

</div>

---

## ⚡ What is DataReaper?

DataReaper is a full-stack autonomous AI platform that hunts down your personal data across the web and forces its deletion — without you lifting a finger.

Data brokers silently collect, package, and sell your personal information. DataReaper fights back by combining advanced OSINT reconnaissance, AI-powered identity resolution, and automated multi-jurisdiction legal compliance to systematically eliminate your digital footprint.

```
Seed Input  →  OSINT Discovery  →  Identity Graph  →  Broker Detection  →  Legal Dispatch  →  Autonomous Follow-up
```

---

## ✨ Features

<details open>
<summary><b>🔍 Intelligent OSINT Discovery</b></summary>
<br/>

- Multi-platform account discovery seeded from email, phone, or username
- Username enumeration via **Maigret** across 3,000+ sites
- Anti-detection profile scraping with **Playwright** headless browser
- Web content extraction via **Trafilatura** and **BeautifulSoup4**
- Configurable probe depth: platform candidates, Maigret top-sites, max connections
- DuckDuckGo fallback, paste-site search, and search probe layers (feature-flagged)

</details>

<details>
<summary><b>🧠 AI-Powered Identity Resolution</b></summary>
<br/>

- LLM-driven cross-platform data correlation (Groq / llama-3.3-70b-versatile)
- Force-directed interactive identity graph with node-edge visualization
- Nodes: seeds, discovered accounts, usernames, aliases, resolved attributes
- Edges: `pivoted_to`, `discovered_username`, `found_on_broker`, and more
- Real-time graph updates as new data surfaces during scanning

</details>

<details>
<summary><b>🎯 Broker Detection & Verification</b></summary>
<br/>

- Automated scanning against a catalog of 100+ data brokers
- Confidence-scored listing verification per broker
- Opt-out rule engine with broker-specific workflows (email / form / phone)
- Contact point discovery and validation
- YAML-driven broker catalog — easily extensible

</details>

<details>
<summary><b>⚖️ Legal Automation Engine</b></summary>
<br/>

- Multi-jurisdiction compliance: **GDPR**, **CCPA**, **DPDP Act (India)**
- Automated legal notice generation via AI Legal Agent
- Escalation workflows for non-compliant brokers
- Full audit trail and compliance tracking
- Configurable default jurisdiction per deployment

</details>

<details>
<summary><b>📧 Autonomous Email Warfare</b></summary>
<br/>

- Gmail OAuth 2.0 integration for sending and receiving
- AI intent classification for incoming broker emails
- Context-aware reply generation with objection handling
- Thread continuity and conversation memory
- Attachment handling for ID verification requests
- Periodic inbox sync (every 5 minutes) via background scheduler

</details>

<details>
<summary><b>🛡️ Tripwire Chrome Extension</b></summary>
<br/>

- Downloadable Chrome extension (`datareaper-tripwire.zip`) served directly from the API
- Real-time malicious site detection and threat logging
- Password field interception monitoring (block / allow tracking)
- Heartbeat-based session linking via short-lived Redis tokens
- Shield Logs dashboard: per-hostname threat events and password attempt history

</details>

<details>
<summary><b>👻 Shadow Browser</b></summary>
<br/>

- Decoy persona engine — AI-generated fake identities browse in the background
- Randomizable personas with age, occupation, and interests
- Decoy session simulation to pollute data broker profiles
- Per-persona browsing history viewer with search and date grouping
- Toggle on/off from the dashboard; communicates with the Tripwire extension via `postMessage`

</details>

<details>
<summary><b>🪞 Access Mirror</b></summary>
<br/>

- Google OAuth 2.0 connect flow with PKCE
- Live scope analysis: maps granted scopes to risk levels (LOW / MEDIUM / HIGH)
- Per-app grant revocation with audit log
- Data export parser: upload Google Takeout (and Instagram, LinkedIn, Amazon, Spotify, Uber) archives up to 200 MB
- Extracts authorized OAuth apps from Google Takeout exports
- Persists reports to PostgreSQL with in-memory fallback

</details>

<details>
<summary><b>📊 Real-Time Command Center</b></summary>
<br/>

- Exposure metrics dashboard with live scan progress
- Activity timeline with chronological event feed
- Threat level assessment and prioritization
- WebSocket-powered live updates
- TanStack Query for optimistic UI and background refetching

</details>

<details>
<summary><b>🎖️ Privacy War Room</b></summary>
<br/>

- Centralized broker case management
- One-click deletion request dispatch
- Email thread viewer with AI-generated legal notices
- Escalation management for non-compliant brokers
- Batch operations across multiple broker cases
- Compliance deadline tracking and response time analytics

</details>

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Frontend  (React 18 + Vite)                   │
│                                                                      │
│  Landing  │  Onboarding  │  Command Center  │  Identity Graph        │
│  War Room │  Inbox       │  Shield Logs     │  Shadow Browser        │
│  Access Mirror           │  Google Auth Callback                     │
│                                                                      │
│  TanStack Query  ·  React Router 7  ·  Radix UI  ·  Motion          │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  REST API  +  WebSocket
┌────────────────────────────▼─────────────────────────────────────────┐
│                       Backend  (FastAPI 0.116+)                      │
│                                                                      │
│  /api/onboarding   /api/scans      /api/dashboard   /api/recon      │
│  /api/targets      /api/war-room   /api/inbox        /api/reports   │
│  /api/events       /api/shield     /api/access-mirror               │
│  /v1/content       /ws/*                                            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Agent Orchestration                      │    │
│  │   Sleuth Agent  ·  Legal Agent  ·  Communications Agent    │    │
│  │   Prompt Manager  ·  Agent Registry  ·  Base Agent         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      Core Services                         │    │
│  │  OSINT Engine  ·  Broker Discovery  ·  Email Sync          │    │
│  │  Legal Compliance  ·  Identity Resolution  ·  Scraper      │    │
│  │  Access Mirror Parser  ·  Report Builder                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │               Background Workers  (ARQ + Redis)            │    │
│  │  run_osint_pipeline  ·  discover_targets                   │    │
│  │  send_legal_requests  ·  sync_inbox                        │    │
│  │  continue_battles  ·  build_report_snapshot (cron)         │    │
│  │  cleanup_old_events (cron)  ·  sync_active_scan_inboxes    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
    PostgreSQL            Redis            Playwright
    (SQLAlchemy)       (ARQ Queue)       (Headless Browser)
```

### Multi-Stage Scan Pipeline

```
1. Validate Seed          →  email / phone / username
2. Discover Accounts      →  Maigret + platform probes
3. Extract Usernames      →  cross-platform pivoting
4. Scrape Profiles        →  Playwright + Trafilatura
5. Resolve Identity       →  LLM correlation
6. Discover Targets       →  broker catalog matching
7. Generate Notices       →  Legal Agent (GDPR/CCPA/DPDP)
8. Send Requests          →  Gmail OAuth dispatch
9. Monitor Responses      →  inbox sync + AI triage
10. Escalate / Follow-up  →  Communications Agent
```

---

## 🛠️ Tech Stack

### Frontend

| | Technology | Version | Purpose |
|---|---|---|---|
| ⚛️ | React | 18.3.1 | UI framework |
| 🔷 | TypeScript | 5.0+ | Type safety |
| ⚡ | Vite | 6.4+ | Build tool |
| 🔄 | TanStack Query | 5.99+ | Server state |
| 🛣️ | React Router | 7.13+ | Routing |
| 🎨 | Radix UI | Latest | Accessible primitives (30+ components) |
| 💨 | Tailwind CSS | 4.1+ | Utility-first styling |
| 🎬 | Motion | 12.23+ | Animations |
| 📊 | Recharts | 2.15+ | Data visualization |
| 🌐 | Axios | 1.15+ | HTTP client |
| 🔔 | Sonner | 2.0+ | Toast notifications |
| 📋 | React Hook Form | 7.55+ | Form management |
| 🖱️ | React DnD | 16.0.1 | Drag and drop |

### Backend

| | Technology | Version | Purpose |
|---|---|---|---|
| 🐍 | Python | 3.11+ | Core language |
| 🚀 | FastAPI | 0.116+ | Web framework |
| 🗄️ | SQLAlchemy | 2.0+ | Async ORM |
| ✅ | Pydantic | 2.11+ | Data validation |
| 🔄 | Alembic | 1.14+ | DB migrations |
| 🌐 | Uvicorn | 0.34+ | ASGI server |
| 🐘 | asyncpg | 0.30+ | Async PostgreSQL |
| 📬 | ARQ | 0.26+ | Async task queue |
| ⏰ | APScheduler | 3.11+ | Job scheduling |
| 📝 | Structlog | 25.3+ | Structured logging |

### AI & Automation

| | Technology | Purpose |
|---|---|---|
| 🤖 | Groq (llama-3.3-70b) | LLM inference for agents |
| 🎭 | Playwright | Anti-detection browser automation |
| 🔍 | Maigret | Username OSINT (3,000+ sites) |
| 🌿 | BeautifulSoup4 | HTML parsing |
| 📄 | Trafilatura | Web content extraction |
| 🔒 | curl-cffi | Anti-detection HTTP client |

### Infrastructure

| | Technology | Purpose |
|---|---|---|
| 🐘 | PostgreSQL | Primary database |
| 🔴 | Redis | Cache + task queue backend |
| 📧 | Gmail API | OAuth email send/receive |
| 🔑 | Google OAuth 2.0 | User auth + Access Mirror |
| 🐳 | Docker | Containerization |

---

## 🗄️ Database Schema

7 Alembic migrations covering 20+ tables:

```
users                  scan_jobs              seeds
discovered_accounts    graph_nodes            graph_edges
brokers                broker_listings        broker_cases
email_threads          email_messages         attachments
legal_requests         audit_logs             consent
activity_events        report_snapshots       agent_runs
scan_stages            access_mirror_reports  google_oauth_connections
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+ and pnpm
- PostgreSQL database
- Redis server
- Groq API key
- Gmail API credentials (for email features)

### Backend Setup

```bash
# 1. Clone and enter backend
git clone https://github.com/yourusername/datareaper.git
cd datareaper/backend

# 2. Install dependencies (uv recommended)
pip install uv
uv sync

# 3. Configure environment
cp .env.example .env
```

Edit `.env`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/datareaper
SYNC_DATABASE_URL=postgresql+psycopg://user:pass@localhost/datareaper

# Redis
REDIS_URL=redis://127.0.0.1:6379/0

# AI
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# Google Sign-In + Access Mirror
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret

# Gmail API (inbox/send features)
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_SENDER_EMAIL=your_sender@gmail.com
GMAIL_SENDER_CLIENT_ID=your_sender_client_id
GMAIL_SENDER_CLIENT_SECRET=your_sender_client_secret
GMAIL_SENDER_REFRESH_TOKEN=your_sender_refresh_token

# App
APP_DEBUG=true
FRONTEND_URL=http://localhost:5173
DEFAULT_JURISDICTION=DPDP
```

```bash
# 4. Run migrations
alembic upgrade head

# 5. Seed data (optional)
python scripts/import_broker_catalog.py
python scripts/import_platform_catalog.py
python scripts/seed_demo_data.py

# 6. Start API + worker (Windows)
.\scripts\start_stack.ps1

# Or manually
uvicorn datareaper.main:app --reload --app-dir src --port 8000
arq datareaper.workers.scheduler.WorkerSettings
```

API available at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend available at `http://localhost:5173`

### Demo Mode

```bash
cd backend
python scripts/seed_demo_data.py
```

Populates sample scans, identity graph, broker cases, and email threads for exploration.

---

## 📚 API Documentation

With the backend running:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health**: http://localhost:8000/api/health

### Key Endpoints

```
POST   /api/onboarding/start              Start a new privacy scan
GET    /api/scans/{scan_id}               Scan status and results
GET    /api/dashboard/overview            Exposure metrics
GET    /api/recon/graph/{scan_id}         Identity graph data
GET    /api/targets/{scan_id}             Discovered broker targets
GET    /api/war-room/cases                All broker cases
POST   /api/war-room/cases/{id}/dispatch  Send deletion request
GET    /api/inbox/threads                 Email threads
POST   /api/inbox/sync                    Sync Gmail inbox
GET    /api/shield/status                 Tripwire extension status
POST   /api/shield/token                  Issue shield token
GET    /api/shield/download               Download Tripwire extension
GET    /api/access-mirror/google/config   Google OAuth config
POST   /api/access-mirror/google/connect  Connect Google account
GET    /api/access-mirror/google/grants   View OAuth grants
POST   /api/access-mirror/google/revoke   Revoke app access
POST   /api/access-mirror/parse           Parse data export archive
GET    /api/reports/{scan_id}             Privacy report
WS     /ws/scans/{scan_id}               Real-time scan events
```

---

## 🖼️ Screenshots

### Landing Page
![Landing Page](Screenshots/Landing%20Page.png)

Hero section, problem statement, three-pillar feature showcase (Scan → Identify → Terminate), process flow visualization, and CTA.

---

### Onboarding
![Onboarding Page](Screenshots/Onboarding%20Page.png)

Seed input (email / phone / username), jurisdiction selection (GDPR / CCPA / DPDP), privacy preferences, and scan initialization.

---

### Command Center
![Command Centre](Screenshots/Command%20Centre.png)

Live exposure metrics, active scan monitoring, threat assessment, quick actions, and chronological activity timeline.

---

### Identity Graph
![Identity Graph](Screenshots/Identity%20Graph.png)

Interactive force-directed graph showing seeds, discovered accounts, usernames, aliases, resolved attributes, and broker exposures — with real-time updates.

---

### War Room
![War Room](Screenshots/War%20Room.png)

Broker target inventory, deletion campaign status, AI-generated legal notice viewer, escalation management, and batch operations.

---

### Shadow Browser
![Shadow Browser](Screenshots/Shadow%20Browser.jpeg)

Decoy persona engine running in the background — AI-generated fake identities browse the web so data brokers see someone else. Shows the currently active persona (Mabel Thornton, 82 · Bridge Player), their interests, a randomize button, the full decoy visit history with timestamps and favicons, simulated account sessions, and a searchable per-persona history panel.

---

### Access Mirror
![Access Mirror](Screenshots/Access%20Mirror.jpeg)

Your data footprint, laid bare. The Google Hub connects your Google account and surfaces every OAuth grant with risk levels (HIGH / LOW) and a per-app Revoke button. The Universal Data Drop accepts Takeout exports from Google, Instagram, LinkedIn, Amazon, Spotify, Uber, and more — DataReaper parses the archive and shows exactly what each platform has built on you.

---

### Shield Logs
![Shield Logs](Screenshots/Shield%20Logs.jpeg)

Tripwire threat log pulled live from the Chrome extension. Shows all malicious hostnames detected during browsing — select one to see Tripwire / malicious URL event counts, password interception stats (blocked vs allowed), the full malicious URL log with timestamps, and a per-attempt password field breakdown.

---

## 📁 Project Structure

```
datareaper/
├── backend/
│   ├── src/datareaper/
│   │   ├── agents/          # Sleuth, Legal, Communications agents
│   │   ├── api/             # FastAPI routes (15 route modules)
│   │   ├── brokers/         # Broker catalog, discovery, opt-out rules
│   │   ├── comms/           # Gmail client, OAuth, intent classifier
│   │   ├── compliance/      # GDPR / CCPA / DPDP legal engine
│   │   ├── core/            # Config, logging, constants, IDs
│   │   ├── db/              # Models, repositories, session
│   │   ├── identity/        # Identity resolution
│   │   ├── integrations/    # Groq LLM, Playwright browser
│   │   ├── osint/           # Discovery pipeline
│   │   ├── scraper/         # Web scraping orchestration
│   │   ├── services/        # Business logic layer
│   │   └── workers/         # ARQ jobs + scheduler
│   ├── data/
│   │   ├── brokers/         # broker_catalog.yaml, opt_out_rules.yaml
│   │   ├── legal/           # gdpr_rules.yaml, ccpa_rules.yaml, dpdp_rules.yaml
│   │   ├── platforms/       # platform_selectors.yaml, probe catalogs
│   │   └── prompts/         # LLM prompt templates (10 prompts)
│   ├── migrations/          # 7 Alembic migrations
│   └── scripts/             # Import, seed, smoke test, replay utilities
├── frontend/
│   ├── src/
│   │   ├── components/      # 18 components including AnimatedDataReaperLogo
│   │   ├── pages/           # 9 pages
│   │   ├── lib/             # API client, hooks, WebSocket, session manager
│   │   └── styles/          # Tailwind, theme, fonts, cursor
│   └── public/
└── .codex_tmp_accessmirror/ # Access Mirror component staging blocks
```

---

## 🔒 Security & Privacy

- Google OAuth 2.0 for user authentication and Gmail access
- JWT-based session management with realtime tokens for WebSocket auth
- CORS configured for frontend origin + Chrome extension ID pattern
- Pydantic v2 input validation on all API endpoints
- SQLAlchemy ORM for SQL injection protection
- Audit trail for all compliance operations
- Consent tracking per user
- No third-party analytics — your data stays in your database
- Responsible use: scan only your own personal information

---

## 🧪 Testing

```bash
# Backend
cd backend
pytest
pytest --cov=datareaper --cov-report=html

# Frontend
cd frontend
pnpm test
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m 'Add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

Before committing:

```bash
# Backend
ruff check .
mypy src/

# Frontend
pnpm lint
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

[Maigret](https://github.com/soxoj/maigret) · [Playwright](https://playwright.dev/) · [FastAPI](https://fastapi.tiangolo.com/) · [React](https://reactjs.org/) · [Radix UI](https://www.radix-ui.com/) · [Tailwind CSS](https://tailwindcss.com/) · [Groq](https://groq.com/)

---

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=14&duration=3000&pause=1000&color=8B85FF&center=true&vCenter=true&width=500&height=30&lines=Hunt+Down+Your+Data.+Force+Its+Deletion." alt="Footer tagline" />

<br/>

[⬆ Back to Top](#datareaper)

</div>
