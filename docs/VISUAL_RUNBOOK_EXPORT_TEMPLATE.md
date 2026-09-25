# Visual Runbook Export Template (`v1.0` / `v1.1` Customer Deliverable)

Every committed version in `data/demo_vault/<demo_id>/<version>/` exports a structured 3-Chapter Visual Manual across `.md`, `.html`, `.docx`, and `.pdf`:

## Chapter 1: Platform Admin — Environment Authentication & GCP Console Provisioning (`Steps 01–06`)
- **Step 01:** Initial SSO / Identity Login & Session Handshake (`01_initial_login.png`)
- **Step 02:** GCP Console → AI Applications → Gemini Enterprise Engines Overview (`02_gcp_console_engines.png`)
- **Step 03:** Connected Data Stores & MCP Connector Catalog Selection (`03_connector_catalog.png`)
- **Step 04:** Connector Mode, OAuth 2.0 / WIF Authentication & `Verify Auth` (`04_verify_auth.png`)
- **Step 05:** Entity Selection, ACL Mapping & Schema Binding (`05_entity_acl_binding.png`)
- **Step 06:** Connector Active Verification & Equivalent `gcloud` / `Terraform` IaC Snippet (`06_connector_active.png`)

## Chapter 2: Source System Ground Truth & L1 Operations Verification (`Steps 07–08`)
- **Step 07:** Live Target System Record Inspection (e.g., ServiceNow Incident / Veeva Vault SOP) (`07_source_ground_truth.png`)
- **Step 08:** Cloud Logging & Connector Telemetry Readiness (`08_cloud_logging_telemetry.png`)

## Chapter 3: Business End-User — Gemini Enterprise Web App E2E Execution (`Steps 09–12`)
- **Step 09:** Gemini Enterprise Web App Login & Scoped Connector Selection (`09_ge_connector_toggle.png`)
- **Step 10:** Multi-Turn Grounded Prompt Execution & Tool Call Trace (`10_ge_prompt_tool_trace.png`)
- **Step 11:** Action Confirmation Card (`[Confirm]`) & Grounded Citation Output (`11_ge_cited_response.png`)
- **Step 12:** Side-by-Side Target System Write/Read Verification (`12_side_by_side_verified.png`)
