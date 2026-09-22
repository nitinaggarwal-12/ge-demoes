# Gemini Enterprise (GE) & ServiceNow Connector — Complete Setup, MCP Server & Visual Configuration Guide

Complete end-to-end reference implementation, setup automation, BYOMCP server, and step-by-step visual configuration guide for connecting **ServiceNow** to **Google Cloud Gemini Enterprise (Vertex AI Search / Agentspace)** across all supported connector architectures:
1. **Mode 1 — BYOMCP (Bring Your Own MCP Server on Cloud Run)**
2. **Mode 2 — 1st-Party (1P) ServiceNow MCP Actions Connector**
3. **Mode 3 — Federated Search & Batch Data Ingestion Connector**

> **Security & Privacy Note**: All confidential credentials, usernames, passwords, OAuth client IDs/secrets, project IDs, instance subdomains, and unique URL identifiers (`cid`, engine IDs, connector IDs) have been fully redacted across both source code and visual screenshots.

---

## Repository Structure

```text
.
├── package.json                                  # Standalone package manifest & CLI scripts
├── README.md                                     # Complete visual configuration guide & CLI runbook
├── src/
│   └── mcp-server/
│       └── server.mjs                            # ServiceNow BYOMCP / GxP LIMS MCP Server (JSON-RPC 2.0 / SSE / REST tools)
├── data/
│   └── servicenow_live_sample_data.json          # Sanitized ServiceNow Incident, CMDB CI Asset, KB & Change Request dataset
├── scripts/
│   ├── setup/
│   │   ├── step1_inspect_ge_instance.mjs
│   │   ├── run_byomcp_e2e_with_screenshots.mjs
│   │   ├── run_mode2_1p_mcp_actions_with_screenshots.mjs
│   │   └── run_mode3_federated_and_ingestion_with_screenshots.mjs
│   └── screenshots/
│       ├── capture_servicenow_connector_selection_and_query.mjs
│       ├── fill_wizard_step2_tab.mjs
│       ├── capture_final_2_fixes.mjs
│       ├── capture_final_precision_pass.mjs
│       ├── capture_all_servicenow_steps_complete.mjs
│       ├── capture_credentials_and_ge_chat.mjs
│       ├── capture_all_argolis_servicenow_config_steps.mjs
│       ├── login_and_capture_argolis_console.mjs
│       └── capture_headless_ge_and_console.mjs
└── screenshots/
    ├── screenshots_argolis_console/              # Step-by-step Google Cloud Console & GE Chat configuration screenshots
    ├── screenshots_ge_app_and_console/           # Gemini Enterprise App & Cloud Console overview screenshots
    ├── screenshots_live_browser_auth/            # OAuth2 / SSO live authentication flow screenshots
    ├── screenshots_servicenow_connector/         # Real ServiceNow Web UI vs GE Chat side-by-side ground truth screenshots
    └── screenshots_veeva_connector/              # Real Veeva Vault Web UI vs GE Chat side-by-side ground truth screenshots
```

---

## Part 1: Step-by-Step Google Cloud Console Configuration Screenshots

### Step 1.1 — AI Applications → Gemini Enterprise Apps Overview
Navigate to **AI Applications → Apps** in Google Cloud Console to inspect or create your Gemini Enterprise application instance.

![Step 1.1 — AI Applications Apps Overview](./screenshots/screenshots_argolis_console/01_argolis_console_engines_overview.png)

### Step 1.2 — AI Applications → Connected Data Stores & MCP Connectors
Navigate to **AI Applications → Data Stores** to view connected ServiceNow data stores and BYOMCP connectors.

![Step 1.2 — Connected Data Stores Overview](./screenshots/screenshots_argolis_console/02_argolis_console_datastores_overview.png)

### Step 1.3 — Create Data Store Wizard: Selecting the ServiceNow Connector
Click **+ Create Data Store** and scroll through the connector catalog to select **ServiceNow**.

![Step 1.3a — Create Data Store Connector Catalog](./screenshots/screenshots_argolis_console/03_argolis_console_create_datastore_connectors.png)

![Step 1.3b — Selecting the ServiceNow Data Source Card](./screenshots/screenshots_argolis_console/04b_argolis_wizard_step1_servicenow_card_scrolled.png)

### Step 1.4 — Configuring Connector Mode (`Federated Search` vs `Data Ingestion`)
Choose between **Federated search (recommended)** for real-time query execution or **Data ingestion** for indexed ACL-synced search.

![Step 1.4a — ServiceNow Connector Mode Selection](./screenshots/screenshots_argolis_console/05_argolis_wizard_step2_servicenow_mode_and_auth_config.png)

![Step 1.4b — ServiceNow Authentication Fields Blank View](./screenshots/screenshots_argolis_console/06_argolis_wizard_step2_servicenow_auth_fields_scrolled.png)

### Step 1.5 — Inputting ServiceNow OAuth 2.0 Credentials & Testing Connection (`Verify Auth`)
Populate all required ServiceNow OAuth 2.0 fields (`Instance URL`, `Client ID`, `Client Secret`, `Auth URI`, and `Token URI`) and click **Verify Auth** to test and validate the connection.

![Step 1.5a — ServiceNow OAuth2 Credentials Populated with Verify Auth Enabled](./screenshots/screenshots_argolis_console/09_argolis_wizard_step2_servicenow_credentials_filled.png)

![Step 1.5b — Clicking Verify Auth to Validate ServiceNow Connection](./screenshots/screenshots_argolis_console/09b_argolis_wizard_step2_servicenow_verify_auth_clicked.png)

### Step 1.6 — Connection Tested: Configuring Destinations & Advanced Sync Settings
After credential validation succeeds, configure destination regions and advanced synchronization parameters.

![Step 1.6a — Step 3 Destinations After Connection Test](./screenshots/screenshots_argolis_console/10_argolis_wizard_step3_servicenow_connection_tested_destinations.png)

![Step 1.6b — Destinations Configuration Expanded](./screenshots/screenshots_argolis_console/10b_argolis_wizard_step3_destinations_expanded.png)

![Step 1.6c — Step 4 Advanced Options Expanded](./screenshots/screenshots_argolis_console/10c_argolis_wizard_step4_advanced_options_expanded.png)

### Step 1.7 — Selecting ServiceNow Entities to Index / Search
Select the ServiceNow tables and entities to expose to Gemini Enterprise (`Incidents`, `Knowledge Articles`, `Change Requests`, `Catalog Items`, `CMDB Assets`).

![Step 1.7 — Step 5 ServiceNow Entities to Search](./screenshots/screenshots_argolis_console/11_argolis_wizard_step5_servicenow_entities_to_search.png)

### Step 1.8 — Managing Active BYOMCP ServiceNow Connectors & Updating Credentials
Inspect active BYOMCP ServiceNow connectors, edit runtime MCP parameters, or re-authenticate OAuth credentials at any time.

![Step 1.8a — Active BYOMCP ServiceNow Connector Detail Page](./screenshots/screenshots_argolis_console/07_argolis_existing_byomcp_datastore_detail_config.png)

![Step 1.8b — View/Edit MCP Connector Parameters Modal](./screenshots/screenshots_argolis_console/12_argolis_byomcp_view_edit_parameters_modal.png)

![Step 1.8c — Re-authenticate / Update Authentication Modal (Blank)](./screenshots/screenshots_argolis_console/13_argolis_byomcp_reauthenticate_credentials_modal.png)

![Step 1.8d — Re-authenticate Modal with OAuth Credentials Populated & Verify Auth Active](./screenshots/screenshots_argolis_console/13b_argolis_byomcp_reauthenticate_credentials_populated.png)

![Step 1.8e — Gemini Enterprise App Configuration & Connected Data Stores](./screenshots/screenshots_argolis_console/08_argolis_gemini_enterprise_app_config_and_connected_datastores.png)

---

## Part 2: Gemini Enterprise (`GE`) Chat App — Selecting the ServiceNow Connector & Querying ServiceNow Live

### Step 2.1 — Launching Gemini Enterprise Web App (`New chat`)
Open the Gemini Enterprise web application home view.

![Step 2.1 — Gemini Enterprise Web App Home Screen](./screenshots/screenshots_argolis_console/14_argolis_ge_chat_home_screen.png)

### Step 2.2 — Selecting the ServiceNow Connector in the `Sources` Menu
Click the **Sources / Connectors** control inside the main chat composer and ensure the **ServiceNow MCP Connectors** are toggled **ON**.

![Step 2.2 — Selecting ServiceNow MCP Connectors in Sources Menu](./screenshots/screenshots_argolis_console/19_ge_chat_sources_menu_servicenow_connector_selected.png)

### Step 2.3 — Submitting a Live ServiceNow Query in GE Chat
Enter a natural-language ServiceNow query directly into the main Gemini Enterprise prompt composer.

![Step 2.3 — ServiceNow Query Prompt Entered in Main Composer](./screenshots/screenshots_argolis_console/20_ge_chat_servicenow_connector_prompt_ready.png)

### Step 2.4 — Reviewing & Confirming Live ServiceNow Tool Execution
Gemini Enterprise invokes the ServiceNow MCP connector tool (`Review: Get ServiceNow Incident Details`) and prompts for confirmation (`Send`).

![Step 2.4 — ServiceNow Connector Tool Invocation Review Card](./screenshots/screenshots_argolis_console/21_ge_chat_servicenow_connector_tool_call_state.png)

### Step 2.5 — Live ServiceNow Incident Retrieval Response (`INC0032555`)
After clicking **Send**, Gemini Enterprise retrieves live incident details (`sys_id`, status, priority, opened timestamp, and short description) directly from ServiceNow.

![Step 2.5 — Live ServiceNow Incident Retrieval Response](./screenshots/screenshots_argolis_console/15_argolis_ge_chat_servicenow_incident_retrieval_thread.png)

### Step 2.6 — Live ServiceNow CMDB Asset & GxP LIMS Configuration Item Query (`CI-LIMS-PROD-04`)
Querying ServiceNow CMDB configuration items and linked change/incident records (`INC0010482`).

![Step 2.6 — Live ServiceNow CMDB Asset & Incident Thread](./screenshots/screenshots_argolis_console/16_argolis_ge_chat_gxp_lims_asset_ci_thread.png)

---

## Part 3: Architecture & Verification Across All 3 Connector Modes

### Mode 1 — BYOMCP Cloud Run ServiceNow Connector
- **Connector Mode**: `custom_mcp` (BYOMCP)
- **Protocol**: Model Context Protocol (MCP) JSON-RPC 2.0 Streamable HTTP POST `/mcp`
- **Authentication**: OAuth 2.0 Authorization Code flow with live token exchange (`/oauth_token.do`)
- **Console Configuration**: Verified in [Step 1.8a Active BYOMCP ServiceNow Connector Detail](file:///Users/nitinagga/documents/demoes-ge/screenshots/screenshots_argolis_console/07_argolis_existing_byomcp_datastore_detail_config.png) and [Step 1.8e Gemini Enterprise App Configuration](file:///Users/nitinagga/documents/demoes-ge/screenshots/screenshots_argolis_console/08_argolis_gemini_enterprise_app_config_and_connected_datastores.png).

### Mode 2 — 1P ServiceNow MCP Actions Connector
- **Connector Mode**: `ACTIONS` (`bap_tool_spec_version_id: "usf-v1"`)
- **Action Catalog**: Discovers 1P ServiceNow Actions (`list_incidents`, `get_incident`, `list_problems`, `search_knowledge_articles`, `list_change_requests`)
- **Console Configuration**: Verified in [Step 1.4a ServiceNow Connector Mode Selection](file:///Users/nitinagga/documents/demoes-ge/screenshots/screenshots_argolis_console/05_argolis_wizard_step2_servicenow_mode_and_auth_config.png) and [Step 1.7 Step 5 Entities to Search](file:///Users/nitinagga/documents/demoes-ge/screenshots/screenshots_argolis_console/11_argolis_wizard_step5_servicenow_entities_to_search.png).

### Mode 3 — Federated Search & Batch Data Ingestion
- **Connector Mode**: `FEDERATED` (zero-copy runtime fan-out) and `DATA_INGESTION` (indexed Vertex AI Search DataStore)
- **Identity & ACLs**: Synchronizes user ACL identity mappings with ServiceNow user records (`sys_user`)
- **Console Configuration**: Verified in [Step 1.6a Step 3 Destinations After Connection Test](file:///Users/nitinagga/documents/demoes-ge/screenshots/screenshots_argolis_console/10_argolis_wizard_step3_servicenow_connection_tested_destinations.png) and [Step 1.6b Destinations Configuration Expanded](file:///Users/nitinagga/documents/demoes-ge/screenshots/screenshots_argolis_console/10b_argolis_wizard_step3_destinations_expanded.png).

---

## Quick Start & CLI Commands

Set your environment variables before running the live setup or capture harnesses:

```bash
export GCP_PROJECT_ID="nixxxx-2"
export ARGOLIS_USERNAME="<YOUR_ARGOLIS_USERNAME>"
export ARGOLIS_PASSWORD="<YOUR_ARGOLIS_PASSWORD>"
export SERVICENOW_INSTANCE_URL="https://gcxxxxr2.service-now.com"
export SERVICENOW_CLIENT_ID="<YOUR_SERVICENOW_CLIENT_ID>"
export SERVICENOW_CLIENT_SECRET="<YOUR_SERVICENOW_CLIENT_SECRET>"
```

Run the MCP server, provisioning harnesses, or headless Chrome screenshot capture scripts:

```bash
npm install

# 1. Start the ServiceNow BYOMCP Server locally
npm run start:mcp-server

# 2. Capture GE Chat ServiceNow connector selection & live query flow
npm run capture:ge-connector-query

# 3. Capture all Google Cloud Console ServiceNow configuration steps
npm run capture:all-config-steps

# 4. Run E2E Setup & Provisioning Harnesses
npm run setup:step1-inspect
npm run setup:mode1-byomcp
npm run setup:mode2-1p-actions
npm run setup:mode3-federated
```

---

## Part 4: Veeva Vault MCP Connector (`veeva_vault_v1_0`) — Setup, Federated OIDC Session Exchange & Live Query Flow

Implements the production `//cloud/ml/discoveryengine/data_connector/registry/connectors/veeva_vault/veeva_vault_v1_0.textproto` specification (`source_target: "projects/$0/locations/global/providers/veeva/connectors/veevavault/versions/2"`), including 2-step Federated OIDC → Veeva Session Exchange (`https://login.veevavault.com/auth/oauth/session/{source:oauth_profile_id}`) and all 8 Veeva Vault MCP Document Actions (`search_documents`, `get_document`, `get_document_type`, `get_document_subtype`, `get_document_versions`, `get_document_version`, `get_document_renditions`, `download_document_file`).

### Configuration Parameters (`first2+xxxx+last2` masked)
- **Vault DNS**: `phxxxx04.veevavault.com`
- **Vault API URL**: `https://phxxxx04.veevavault.com`
- **Okta Domain**: `dexxxx89.okta.com`
- **Okta Authorization Server ID**: `auxxy7z1`
- **Veeva OIDC Profile ID**: `oaxxxx9c`
- **Client ID**: `0oxxxx7d`
- **Federated Session Exchange Endpoint**: `https://login.veevavault.com/auth/oauth/session/oaxxxx9c`
- **Supported MCP Actions**:
  1. `search_documents`: Executes live VQL queries (`SELECT id, name, type__v... FROM documents WHERE ...`)
  2. `get_document`: Retrieves metadata and lifecycle state for specific controlled documents
  3. `get_document_type`: Inspects document type definitions
  4. `get_document_subtype`: Inspects document subtype metadata
  5. `get_document_versions`: Lists major and minor versions of regulated content
  6. `get_document_version`: Retrieves specific version metadata
  7. `get_document_renditions`: Lists rendition formats (viewable PDF, etc.)
  8. `download_document_file`: Fetches document artifact content

Live ground-truth verification screenshots for Veeva Vault are documented below in [Section 2: Veeva Vault MCP Connector Ground Truth](#2-veeva-vault-mcp-connector--side-by-side-ground-truth-screenshots).

---

## 🔬 Ground-Truth Parity Verification: Direct UI vs. Gemini Enterprise Chat (Side-by-Side)

> **Security Note**: All actual authentication details, instance URLs, credentials, OAuth client IDs/secrets, MFA OTP resolution procedures, queries, and results have been moved to the private local file `Auth.md` (`chmod 600`, excluded from Git tracking via `.gitignore`).

### 1. ServiceNow MCP Connector — Side-by-Side Ground-Truth Screenshots

![13 - Real ServiceNow Web UI Query Results](screenshots/screenshots_servicenow_connector/13_servicenow_live_ui_query_results.png)

![13b - Real ServiceNow Web UI Full Incident List](screenshots/screenshots_servicenow_connector/13b_servicenow_live_ui_full_incident_list.png)

![14 - Real Gemini Enterprise Chat UI Matching ServiceNow Query Results](screenshots/screenshots_servicenow_connector/14_ge_chat_matching_servicenow_query_results.png)

![15 - Side-by-Side Real Chrome Screenshots: ServiceNow Web UI vs Gemini Enterprise Chat UI](screenshots/screenshots_servicenow_connector/15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison.png)

### 2. Veeva Vault MCP Connector — Side-by-Side Ground-Truth Screenshots

![11 - Real Veeva Vault Web UI Login & Okta SSO Gate](screenshots/screenshots_veeva_connector/11_veeva_live_ui_query_results.png)

![12 - Real Gemini Enterprise Chat UI Matching Veeva Query Results](screenshots/screenshots_veeva_connector/12_ge_chat_matching_veeva_query_results.png)

![13 - Side-by-Side Real Chrome Screenshots: Veeva Vault Web UI vs Gemini Enterprise Chat UI](screenshots/screenshots_veeva_connector/13_veeva_ui_vs_ge_chat_side_by_side_truth_comparison.png)

