# Demo Generator Architecture & Truthfulness Contract (`demoes-ge`)

## 1. Purpose & Core Guarantee
The **Demo Generator** provides an end-to-end, self-healing, checkpointed environment for designing, validating, executing, and versioning **Gemini Enterprise (GE) + Google Cloud Console** visual demo runbooks from **Initial Login (`Step 01`)** through **Verified End-User Output & Citations (`Step 12`)**.

## 2. State Machine Lifecycle
Every Demo Run progresses through 5 deterministic states:
1. `DRAFT_INPUTS`: User configures scenario prompt, integration mode (`Mode 1 BYOMCP`, `Mode 2 1P Actions`, `Mode 3 Federated/Ingestion`, `Mode 4 A2A Gateway`, `Mode 5 Agent Designer`), target connector (`ServiceNow`, `Veeva Vault`, `SharePoint`, `Jira`, `BigQuery`), URLs, Project ID, and Auth Mechanism.
2. `VALIDATED_PLAN`: Triggered by clicking **`[Validate]`** (or requesting validation in the Copilot Chatbot). Runs non-destructive Pre-Flight checks (Browser resolver, Auth handshake, Regional alignment, IAM roles, Model Armor safety check, Known Blocker matching) and produces a versioned **Execution Plan (`Plan v1.0`, `Plan v1.1`)**.
3. `EXECUTING_CHECKPOINTED`: Triggered only after explicit user **`[Approve & Execute Plan]`**. Runs each step inside an idempotent, checkpointed `StepBoundary` using the 3-Tier Browser Resolver.
4. `REVIEW_PENDING`: Displays all progressive screenshots (`01..N`), fallback disclosures, and any failure-point diagnostics. User can **`[Approve & Save Version]`**, **`[Modify (Full or Partial Re-Run)]`**, **`[Approve & File Ticket on My Behalf]`**, or **`[Reject (Rollback & Discard)]`**.
5. `COMMITTED_VERSION`: Persists `inputs.json`, `plan.json`, `execution_trace.json`, `checkpoints/`, `screenshots/*.png`, and compiled guides (`.md`, `.html`, `.docx`, `.pdf`) inside `data/demo_vault/<demo_id>/<version>/`.

## 3. Radical Honesty & Zero-Fabrication Contract
- **No Silent Fallbacks:** Whenever `Path A` fails and `Path B` (e.g., REST API creation or `Mode 1 BYOMCP` fallback) succeeds, both `Path A`'s failure reason/screenshot and `Path B`'s success screenshot are explicitly logged and displayed to the user.
- **Progressive Failure Visibility:** If execution halts at `Step K`, screenshots `01` through `K-1` plus `K_FAILURE_error.png` are preserved and streamed immediately to the UI.
- **Secret Masking:** All `<input type="password">` and secret token fields are masked (`-webkit-text-security: disc`) prior to `page.screenshot()`.
