<div align="center">
<img src="frontend/public/images/logo.png" alt="DataReaper Logo" width="300"/>
<h1 align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=80&duration=3000&pause=1000&color=8B85FF&center=true&vCenter=true&width=800&height=100&lines=DATAREAPER" alt="DataReaper" />
</h1>

**Autonomous AI-Powered Privacy Defense Platform**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.116+-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

*Your data is exposed. Your identity is mapped. Take it back.*

[Features](#features) • [Tech Stack](#tech-stack) • [Getting Started](#getting-started) • [Architecture](#architecture) • [Screenshots](#screenshots)

</div>

---

## 📖 Overview

**DataReaper** is an autonomous AI system that hunts down your exposed personal data across the web and forces its deletion — without you lifting a finger. It combines advanced OSINT (Open Source Intelligence) techniques, AI-powered identity resolution, and automated legal compliance workflows to help individuals reclaim their digital privacy.

Data brokers are silently collecting, packaging, and selling your personal data faster than you can track it. DataReaper transforms fragmented public data into a unified identity graph, then weaponizes it to systematically eliminate your digital footprint from data broker databases.

### 🎯 Key Capabilities

- **🔍 Comprehensive OSINT Scanning**: Continuously scan 100+ platforms and data broker sites using advanced reconnaissance techniques
- **🧠 AI-Powered Identity Resolution**: Build complete digital identity graphs through intelligent cross-platform pivoting
- **⚖️ Automated Legal Compliance**: Generate and dispatch legally binding deletion requests (GDPR, CCPA, DPDP Act)
- **📧 Autonomous Email Warfare**: AI agents handle broker responses, objections, and escalations automatically
- **📊 Real-Time Intelligence Dashboard**: Monitor exposure levels, track deletion progress, and visualize your identity graph
- **🎯 War Room Operations**: Coordinate multi-broker deletion campaigns with military precision

---

## ✨ Features

### 1. **Intelligent OSINT Discovery**
- Multi-platform account discovery using email, phone, or username seeds
- Username enumeration across social networks and forums
- Profile scraping with anti-detection browser automation
- Maigret integration for deep username reconnaissance

### 2. **Identity Graph Construction**
- AI-powered identity resolution using LLM analysis
- Cross-platform data correlation and pivoting
- Visual graph representation of digital footprint
- Real-time graph updates as new data is discovered

### 3. **Broker Detection & Verification**
- Automated scanning of 100+ data broker catalogs
- Intelligent listing verification with confidence scoring
- Opt-out rule engine for broker-specific workflows
- Contact point discovery and validation

### 4. **Legal Automation Engine**
- Multi-jurisdiction compliance (GDPR, CCPA, DPDP Act)
- Automated legal notice generation
- Escalation workflows for non-compliant brokers
- Audit trail and compliance tracking

### 5. **Autonomous Communication Agents**
- Intent classification for incoming broker emails
- Context-aware reply generation
- Objection handling and legal argumentation
- Thread continuity and conversation memory

### 6. **Privacy War Room**
- Centralized command center for deletion campaigns
- Real-time status tracking across all brokers
- Threat level assessment and prioritization
- Batch operations and bulk actions

---

## 🖼️ Screenshots

### Landing Page
![Landing Page](Screenshots/Landing%20Page.png)

**The Gateway to Privacy Reclamation**

The landing page introduces users to DataReaper's mission with a compelling narrative about data exposure and digital privacy. It features:
- Hero section with clear value proposition
- Problem statement highlighting data broker threats
- Feature showcase explaining the three-pillar approach: Scan, Identify, Terminate
- Process flow visualization showing how DataReaper works
- Call-to-action for launching privacy protection

---

### Onboarding Page
![Onboarding Page](Screenshots/Onboarding%20Page.png)

**Seamless Privacy Journey Initialization**

The onboarding experience guides users through their first privacy scan with:
- Simple seed input (email, phone, or username)
- Jurisdiction selection for legal compliance
- Privacy preferences configuration
- Real-time scan initialization
- Educational tooltips explaining each step

---

### Command Centre
![Command Centre](Screenshots/Command%20Centre.png)

**Mission Control for Your Digital Privacy**

The Command Centre serves as the central dashboard providing:
- **Exposure Overview**: Real-time metrics on discovered accounts, data brokers, and deletion progress
- **Active Scans**: Monitor ongoing OSINT reconnaissance operations
- **Threat Assessment**: Visual indicators of exposure severity across different categories
- **Quick Actions**: Launch new scans, review reports, or access the War Room
- **Timeline View**: Chronological activity feed of discoveries and deletions
- **Statistics Dashboard**: Charts and graphs showing privacy improvement over time

---

### Identity Graph
![Identity Graph](Screenshots/Identity%20Graph.png)

**Visualize Your Digital Footprint**

The Identity Graph provides an interactive visualization of your digital identity:
- **Node-Based Visualization**: See how your data points connect across platforms
- **Relationship Mapping**: Understand how brokers correlate your information
- **Platform Clustering**: Group accounts by social networks, forums, and data brokers
- **Interactive Exploration**: Click nodes to reveal detailed information
- **Export Capabilities**: Generate reports from graph data
- **Real-Time Updates**: Watch the graph evolve as new data is discovered

The graph uses force-directed layout algorithms to show:
- Seed identifiers (email, phone, username)
- Discovered platform accounts
- Extracted usernames and aliases
- Resolved identity attributes (name, location)
- Data broker listings and exposures

---

### War Room
![War Room](Screenshots/War%20Room.png)

**Coordinate Deletion Campaigns with Precision**

The War Room is where deletion operations are planned and executed:
- **Broker Target List**: Complete inventory of data brokers holding your information
- **Campaign Status**: Track deletion request status (pending, in-progress, completed, escalated)
- **Email Thread Viewer**: Review AI-generated legal notices and broker responses
- **Escalation Management**: Handle non-compliant brokers with automated escalation workflows
- **Batch Operations**: Execute mass deletion requests across multiple brokers
- **Compliance Tracking**: Monitor legal deadlines and response times
- **Agent Activity Log**: See what your AI agents are doing in real-time

Key features include:
- One-click deletion request dispatch
- Automated follow-up scheduling
- Legal template customization
- Attachment handling for ID verification requests
- Success rate analytics per broker

---

## 🏗️ Architecture

DataReaper follows a modern microservices-inspired architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Landing  │  │Onboarding│  │ Command  │  │   War    │   │
│  │   Page   │  │   Flow   │  │  Center  │  │   Room   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│         │              │              │              │       │
│         └──────────────┴──────────────┴──────────────┘       │
│                          │                                    │
│                    TanStack Query                            │
│                          │                                    │
└──────────────────────────┼────────────────────────────────────┘
                           │
                      REST API / WebSocket
                           │
┌──────────────────────────┼────────────────────────────────────┐
│                   Backend (FastAPI)                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              API Layer (FastAPI Router)                │  │
│  │  /onboarding  /scans  /dashboard  /war-room  /inbox   │  │
│  └────────────────────────────────────────────────────────┘  │
│                           │                                   │
│  ┌────────────────────────┼────────────────────────────────┐ │
│  │                  Agent Orchestration                    │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │ │
│  │  │  Sleuth  │  │  Legal   │  │   Communications     │ │ │
│  │  │  Agent   │  │  Agent   │  │      Agent           │ │ │
│  │  └──────────┘  └──────────┘  └──────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                   │
│  ┌────────────────────────┼────────────────────────────────┐ │
│  │                  Core Services                          │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │ │
│  │  │  OSINT   │  │ Broker   │  │  Email   │  │ Legal  │ │ │
│  │  │ Engine   │  │Discovery │  │  Sync    │  │Compliance│ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                   │
│  ┌────────────────────────┼────────────────────────────────┐ │
│  │              Infrastructure Layer                       │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │ │
│  │  │PostgreSQL│  │  Redis   │  │Playwright│  │  ARQ   │ │ │
│  │  │  (Neon)  │  │  Cache   │  │ Browser  │  │ Queue  │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### **Frontend Layer**
- **React 18.3** with TypeScript for type-safe UI development
- **Vite** for lightning-fast development and optimized production builds
- **TanStack Query** for server state management and caching
- **Radix UI** for accessible, unstyled component primitives
- **Tailwind CSS 4** for utility-first styling
- **Motion** (Framer Motion) for smooth animations

#### **API Layer**
- **FastAPI** for high-performance async API endpoints
- **Pydantic v2** for request/response validation
- **WebSocket** support for real-time updates
- **CORS middleware** for secure cross-origin requests

#### **Agent System**
- **Sleuth Agent**: OSINT discovery and identity resolution
- **Legal Agent**: Compliance analysis and notice generation
- **Communications Agent**: Email intent classification and reply generation
- **Prompt Manager**: Centralized LLM prompt templates

#### **Core Services**
- **OSINT Engine**: Account discovery, username enumeration, profile scraping
- **Broker Discovery**: Catalog management, listing verification, opt-out rules
- **Email Sync**: Gmail OAuth integration, thread building, attachment handling
- **Legal Compliance**: Multi-jurisdiction rules, escalation workflows, audit trails

#### **Data Layer**
- **PostgreSQL (Neon)**: Primary database with async support via asyncpg
- **SQLAlchemy 2.x**: Modern async ORM with relationship mapping
- **Alembic**: Database migrations and schema versioning

#### **Background Processing**
- **ARQ**: Redis-based async task queue for long-running operations
- **APScheduler**: Cron-like scheduling for periodic scans

#### **External Integrations**
- **Playwright**: Headless browser automation for anti-detection scraping
- **Maigret**: Username OSINT across 3000+ sites
- **Groq**: Fast LLM inference for AI agents
- **Gmail API**: OAuth-based email access and sending

---

## 🛠️ Tech Stack

### **Frontend**

| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI framework | 18.3.1 |
| **TypeScript** | Type-safe JavaScript | 5.0+ |
| **Vite** | Build tool & dev server | 6.4+ |
| **TanStack Query** | Server state management | 5.99+ |
| **Radix UI** | Accessible component primitives | Latest |
| **Tailwind CSS** | Utility-first CSS framework | 4.1+ |
| **Motion** | Animation library | 12.23+ |
| **Recharts** | Data visualization | 2.15+ |
| **React Router** | Client-side routing | 7.13+ |
| **Axios** | HTTP client | 1.15+ |
| **Sonner** | Toast notifications | 2.0+ |

### **Backend**

| Technology | Purpose | Version |
|------------|---------|---------|
| **Python** | Core language | 3.11+ |
| **FastAPI** | Web framework | 0.116+ |
| **SQLAlchemy** | ORM | 2.0+ |
| **Pydantic** | Data validation | 2.11+ |
| **Alembic** | Database migrations | 1.14+ |
| **Uvicorn** | ASGI server | 0.34+ |
| **PostgreSQL** | Primary database | Latest |
| **asyncpg** | Async PostgreSQL driver | 0.30+ |
| **ARQ** | Async task queue | 0.26+ |
| **Redis** | Cache & queue backend | Latest |

### **AI & Automation**

| Technology | Purpose |
|------------|---------|
| **Groq** | Fast LLM inference |
| **Playwright** | Browser automation |
| **Maigret** | Username OSINT |
| **BeautifulSoup4** | HTML parsing |
| **Trafilatura** | Web content extraction |
| **curl-cffi** | Anti-detection HTTP client |

### **Email & Communication**

| Technology | Purpose |
|------------|---------|
| **Google API Client** | Gmail integration |
| **google-auth-oauthlib** | OAuth 2.0 flow |
| **email-validator** | Email validation |

### **DevOps & Testing**

| Technology | Purpose |
|------------|---------|
| **pytest** | Testing framework |
| **pytest-asyncio** | Async test support |
| **pytest-cov** | Coverage reporting |
| **Ruff** | Fast Python linter |
| **Mypy** | Static type checking |
| **Vitest** | Frontend testing |

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+** installed
- **Node.js 18+** and **pnpm** installed
- **PostgreSQL** database (or Neon account)
- **Redis** server running
- **Gmail API credentials** (for email features)
- **Groq API key** (for AI agents)

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/datareaper.git
   cd datareaper/backend
   ```

2. **Install Python dependencies**
   ```bash
   # Using uv (recommended)
   pip install uv
   uv sync

   # Or using pip
   pip install -e ".[dev]"
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and configure:
   ```env
   # Database
   DATABASE_URL=postgresql+asyncpg://user:pass@localhost/datareaper

   # Redis
   REDIS_URL=redis://localhost:6379

   # AI
   GROQ_API_KEY=your_groq_api_key

   # Gmail (optional)
   GMAIL_CLIENT_ID=your_client_id
   GMAIL_CLIENT_SECRET=your_client_secret

   # App
   APP_DEBUG=true
   APP_CORS_ORIGINS=["http://localhost:5173"]
   ```

4. **Run database migrations**
   ```bash
   alembic upgrade head
   ```

5. **Seed initial data** (optional)
   ```bash
   python scripts/import_broker_catalog.py
   python scripts/import_platform_catalog.py
   python scripts/seed_demo_data.py
   ```

6. **Start the backend stack**
   ```powershell
   # Windows PowerShell
   .\scripts\start_stack.ps1

   # Or manually start API and worker
   uvicorn datareaper.main:app --reload --app-dir src --port 8000
   arq datareaper.worker.WorkerSettings
   ```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd ../frontend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment** (if needed)
   ```bash
   # Create .env.local
   echo "VITE_API_URL=http://localhost:8000" > .env.local
   ```

4. **Start development server**
   ```bash
   pnpm dev
   ```

The frontend will be available at `http://localhost:5173`

### Quick Start with Demo Data

To quickly explore DataReaper with pre-populated demo data:

```bash
cd backend
python scripts/seed_demo_data.py
```

This creates:
- Sample scan results
- Demo identity graph
- Mock broker cases
- Example email threads

---

## 📚 API Documentation

Once the backend is running, visit:

- **Interactive API Docs (Swagger)**: http://localhost:8000/docs
- **Alternative API Docs (ReDoc)**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

### Key API Endpoints

#### Onboarding & Scans
- `POST /api/onboarding/start` - Initialize new privacy scan
- `GET /api/scans/{scan_id}` - Get scan status and results
- `POST /api/scans/{scan_id}/resume` - Resume paused scan

#### Dashboard & Analytics
- `GET /api/dashboard/overview` - Get exposure metrics
- `GET /api/dashboard/timeline` - Get activity timeline

#### Identity Graph
- `GET /api/recon/graph/{scan_id}` - Get identity graph data
- `GET /api/targets/{scan_id}` - Get discovered broker targets

#### War Room Operations
- `GET /api/war-room/cases` - List all broker cases
- `POST /api/war-room/cases/{case_id}/dispatch` - Send deletion request
- `GET /api/war-room/cases/{case_id}/thread` - Get email thread

#### Inbox & Communications
- `GET /api/inbox/threads` - List email threads
- `POST /api/inbox/sync` - Sync Gmail inbox
- `POST /api/inbox/reply` - Generate AI reply

---

## 🧪 Testing

### Backend Tests

```bash
cd backend

# Run all tests
pytest

# Run with coverage
pytest --cov=datareaper --cov-report=html

# Run specific test file
pytest tests/test_sleuth_agent.py

# Run with verbose output
pytest -v
```

### Frontend Tests

```bash
cd frontend

# Run all tests
pnpm test

# Run in watch mode
pnpm test --watch

# Run with coverage
pnpm test --coverage
```

---

## 🔒 Security & Privacy

DataReaper is built with security and privacy as core principles:

### Data Protection
- **End-to-end encryption** for sensitive user data
- **Secure credential storage** using environment variables
- **No third-party tracking** or analytics
- **Local-first architecture** - your data stays in your database

### Compliance
- **GDPR compliant** deletion workflows
- **CCPA compliant** opt-out mechanisms
- **DPDP Act** (India) support
- **Audit trails** for all operations

### Security Features
- **OAuth 2.0** for Gmail integration
- **JWT-based** session management
- **Rate limiting** on API endpoints
- **Input validation** with Pydantic
- **SQL injection protection** via SQLAlchemy ORM
- **CORS configuration** for API security

### Responsible Use
DataReaper is designed for **legitimate privacy protection** only. Users must:
- Only scan their own personal information
- Comply with applicable laws and regulations
- Respect platform terms of service
- Use automation responsibly

---

## 📖 Documentation

### Project Structure

```
datareaper/
├── backend/
│   ├── src/datareaper/
│   │   ├── agents/          # AI agent implementations
│   │   ├── api/             # FastAPI routes and endpoints
│   │   ├── brokers/         # Data broker catalog and discovery
│   │   ├── comms/           # Email sync and communication
│   │   ├── compliance/      # Legal compliance engine
│   │   ├── core/            # Core utilities and config
│   │   ├── identity/        # Identity resolution
│   │   ├── osint/           # OSINT discovery tools
│   │   ├── scraper/         # Web scraping orchestration
│   │   └── worker/          # Background task workers
│   ├── migrations/          # Alembic database migrations
│   ├── scripts/             # Utility scripts
│   ├── tests/               # Test suite
│   └── data/                # Static data (catalogs, prompts)
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── lib/             # Utilities and API client
│   │   ├── hooks/           # Custom React hooks
│   │   └── styles/          # Global styles
│   └── public/              # Static assets
└── Screenshots/             # UI screenshots for documentation
```

### Key Concepts

#### **OSINT Discovery**
DataReaper uses a multi-stage OSINT pipeline:
1. **Seed Input**: Start with email, phone, or username
2. **Account Discovery**: Find associated platform accounts
3. **Username Enumeration**: Extract usernames and aliases
4. **Profile Scraping**: Collect detailed profile information
5. **Identity Resolution**: Use AI to correlate data points

#### **Identity Graph**
The identity graph is a node-edge data structure representing:
- **Nodes**: Identifiers, accounts, usernames, attributes, brokers
- **Edges**: Relationships like "pivoted_to", "discovered_username", "found_on_broker"

#### **Broker Cases**
Each data broker exposure becomes a "case" with:
- Discovery metadata (when, how, confidence)
- Opt-out workflow (email, form, phone)
- Legal notice generation
- Email thread tracking
- Status progression (pending → dispatched → completed)

#### **AI Agents**
Three specialized agents work autonomously:
- **Sleuth Agent**: Reconnaissance and discovery
- **Legal Agent**: Compliance analysis and notice drafting
- **Communications Agent**: Email triage and response generation

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow **PEP 8** for Python code
- Use **TypeScript** for all frontend code
- Write **tests** for new features
- Update **documentation** as needed
- Run **linters** before committing:
  ```bash
  # Backend
  ruff check .
  mypy src/

  # Frontend
  pnpm lint
  ```

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Maigret** - Username OSINT framework
- **Playwright** - Browser automation
- **FastAPI** - Modern Python web framework
- **React** - UI library
- **Radix UI** - Accessible component primitives
- **Tailwind CSS** - Utility-first CSS framework

---

## 📞 Support

For questions, issues, or feature requests:

- **GitHub Issues**: [Create an issue](https://github.com/yourusername/datareaper/issues)
- **Email**: support@datareaper.io
- **Documentation**: [docs.datareaper.io](https://docs.datareaper.io)

---

## 🗺️ Roadmap

### Q2 2024
- [ ] Multi-user support with role-based access control
- [ ] Mobile app (React Native)
- [ ] Browser extension for real-time monitoring
- [ ] Expanded broker catalog (200+ brokers)

### Q3 2024
- [ ] Automated form submission for non-email opt-outs
- [ ] Phone call automation for phone-based opt-outs
- [ ] Integration with password managers
- [ ] Dark web monitoring

### Q4 2024
- [ ] Enterprise features (team management, SSO)
- [ ] API for third-party integrations
- [ ] Compliance reporting dashboard
- [ ] AI model fine-tuning for better accuracy

---

<div align="center">



[⬆ Back to Top](#datareaper)

</div>
