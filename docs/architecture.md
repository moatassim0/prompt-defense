# System Architecture

The LLM Prototype Platform is built as a split-stack architecture consisting of a React + Vite Frontend and an Express + Node.js Backend, interacting with a Neon Serverless Postgres Database and multiple external LLM Providers.

## High-Level Architectural Flow

```mermaid
graph TD
    subgraph Frontend [React Application]
        A[UI Components] --> B[Zustand State & Auth]
        B --> C[Axios API Client]
    end

    subgraph Backend [Express Server]
        C -- HTTP/JSON --> D[Controllers]
        D --> E[Services & Logic]
        E --> F[Validators & Migrators]
    end

    subgraph Data [Data Layer]
        E -- SQL --> DB[(Neon Postgres)]
    end

    subgraph External [LLM Providers]
        E -- API calls --> OpenAI[OpenAI API]
        E -- API calls --> Anthropic[Anthropic API]
        E -- API calls --> Cerebras[Cerebras API]
    end

    classDef react fill:#61dafb,stroke:#333,color:#000;
    classDef express fill:#68a063,stroke:#333,color:#fff;
    classDef db fill:#00e5bf,stroke:#333,color:#000;
    
    class Frontend react;
    class Backend express;
    class Data db;
```

---

## The Testing Pipeline

The core engine of this platform is the **Stress Testing and Simulation Pipeline**. This pipeline is responsible for injecting attacks into contexts, applying defense mechanisms in real-time, and evaluating the response using a Multi-Signal Judge.

```mermaid
sequenceDiagram
    participant User
    participant Controller as Testing Controller
    participant Generator as Prompt Generator
    participant Scanner as Document Scanner
    participant Defense as Defense Service
    participant LLM as Target LLM
    participant Judge as Multi-Signal Judge

    User->>Controller: Initiate Stress Test
    Controller->>Scanner: Scan uploaded docs
    Scanner-->>Controller: Return Context Tags (e.g. FINANCIAL, PII)
    Controller->>Generator: Request dynamic prompt (Tags, Attacks)
    Generator-->>Controller: Contextual Analyst Prompt
    
    Controller->>Defense: Apply Active Defenses (Sandwiching, DLP, etc.)
    Defense-->>Controller: Hardened Context
    
    Controller->>LLM: Dispatch malicious prompt
    LLM-->>Controller: LLM Response
    
    Controller->>Judge: Evaluate Response
    Judge-->>Controller: Pipeline block, Echo detected, Judge decision
    Controller-->>User: Metrics & Analytics Payload
```

## Security & State Management

**Authentication:** 
The application relies on JWT (JSON Web Tokens) managed through Postgres for roles and sessions.
- Users authenticate via `/api/auth/login`.
- Tokens are stored entirely statelessly in HTTP headers during interaction.

**Environment Injection:**
The backend utilizes Doppler for secure runtime secrets management, explicitly shielding `JWT_SECRET`, Neon Connection URLs, and vendor API keys from the codebase.
