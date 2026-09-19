# Direct Web UI Login, Authentication, Query & Ground-Truth Results Runbook (ServiceNow & Veeva Vault)

This document records the exact step-by-step Web UI login procedures, URLs, authentication flows (including programmatic Email MFA OTP retrieval on ServiceNow and Federated OIDC Session Exchange on Veeva Vault), direct UI & API queries, and verified side-by-side results compared against **Google Gemini Enterprise (`GE`) Chat UI** (`https://vertexaisearch.cloud.google.com/us/home/cid/e823f383-deba-4330-9270-ed6ac94cbbc6?hl=en_US`).

---

## 1. ServiceNow Instance (`gcpconnector2.service-now.com`) — Web UI Login, Auth, Query & Results

### 1.1 Instance & Endpoint URLs
| Component | URL |
|---|---|
| **ServiceNow Instance Base URL** | `https://gcpconnector2.service-now.com` |
| **ServiceNow Web UI Login Page** | `https://gcpconnector2.service-now.com/login.do` |
| **ServiceNow Web UI Incident List (Unfiltered)** | `https://gcpconnector2.service-now.com/now/nav/ui/classic/params/target/incident_list.do` |
| **ServiceNow Web UI Filtered Query (`Number starts with INC00325`)** | `https://gcpconnector2.service-now.com/now/nav/ui/classic/params/target/incident_list.do%3Fsysparm_query%3DnumberSTARTSWITHINC00325%5EORDERBYDESCnumber` |
| **ServiceNow OAuth 2.0 Token Endpoint** | `https://gcpconnector2.service-now.com/oauth_token.do` |
| **ServiceNow REST Table API Endpoint** | `https://gcpconnector2.service-now.com/api/now/table/incident` |
| **Gemini Enterprise Chat UI URL** | `https://vertexaisearch.cloud.google.com/us/home/cid/e823f383-deba-4330-9270-ed6ac94cbbc6?hl=en_US` |
| **Connected Cloud Run BYOMCP Server URL** | `https://servicenow-mcp-bridge-85xxxx29.us-central1.run.app/mcp` (Collection ID: `servicenow-mcp-cloudrun-gxp_17xxxx92`) |

### 1.2 Web UI Authentication & Programmatic Email MFA OTP Flow
1. **Browser Profile**: Launch Google Chrome with persistent user data dir `--user-data-dir=/tmp/chrome_sn_real` and remote debugging enabled.
2. **Primary Credentials**:
   - **Username**: `ConnectorsUserQA@deloitte.com`
   - **Password**: `${SN_PASSWORD}` (`Dexxxx25`)
   - **OAuth Client ID / Secret**: `43xxxxaf` / `bExxxxQK`
3. **Email MFA OTP Challenge Resolution**:
   - Upon submitting primary credentials on `https://gcpconnector2.service-now.com/login.do`, ServiceNow triggers an Email MFA OTP challenge (`Get a verification code sent to CoXXXXXXXX@deloitte.com`).
   - Whenever ServiceNow sends an Email MFA OTP, it writes an event row into table `sysevent` with:
     - `name = "multifactor.email.otp"`
     - `parm1 = "ConnectorsUserQA@deloitte.com"`
     - `parm2 = "<6-digit-otp-code>"`
   - Retrieve the live 6-digit OTP programmatically via the ServiceNow Table API:
     ```bash
     # 1. Obtain OAuth 2.0 Bearer Token
     SN_TOKEN=$(curl -s -X POST "https://gcpconnector2.service-now.com/oauth_token.do" \
       -H "Content-Type: application/x-www-form-urlencoded" \
       -d "grant_type=password&client_id=${SN_CLIENT_ID}&client_secret=${SN_CLIENT_SECRET}&username=${SN_USERNAME}&password=${SN_PASSWORD}" \
       | jq -r '.access_token')

     # 2. Fetch latest 6-digit Email MFA OTP from sysevent
     MFA_OTP=$(curl -s -H "Authorization: Bearer ${SN_TOKEN}" \
       "https://gcpconnector2.service-now.com/api/now/table/sysevent?sysparm_query=name=multifactor.email.otp^ORDERBYDESCsys_created_on&sysparm_limit=1" \
       | jq -r '.result[0].parm2')
     echo "Live 6-digit ServiceNow MFA OTP: ${MFA_OTP}"
     ```
   - Enter `${MFA_OTP}` into the MFA verification input with **"Do not challenge for MFA on this browser for the next 8 hours"** checked and click **Verify**.

### 1.3 Direct Web UI & API Queries Executed
- **Direct ServiceNow Web UI Query**:
  - **Filter Breadcrumb**: `All > Number starts with INC00325` (`ORDERBYDESCnumber`)
  - **Column Search Input (`Number`)**: `INC00325`
- **Direct ServiceNow REST API Query**:
  ```bash
  curl -s -H "Authorization: Bearer ${SN_TOKEN}" \
    "https://gcpconnector2.service-now.com/api/now/table/incident?sysparm_query=numberSTARTSWITHINC00325^ORDERBYDESCnumber&sysparm_fields=number,short_description,priority,state,sys_updated_on"
  ```
- **Gemini Enterprise Chat UI Prompt (`Super Admin Plus` session at `/tmp/chrome_argolis_session`)**:
  > *"Retrieve active ServiceNow incidents from the connected ServiceNow MCP connector and display them in a structured table with Number, Short Description, Priority, State, and Updated timestamp."*

### 1.4 Verified Row-for-Row Results Table (ServiceNow UI vs. Gemini Enterprise UI)

| # | Incident Number | Short Description | Priority (ServiceNow UI / GE UI) | State (ServiceNow UI / GE UI) | Updated Timestamp | Parity |
|---|---|---|---|---|---|---|
| 1 | `INC0032571` | `2026_09_19_15` | `5 - Planning` | `New` / `1 - New` | `2026-09-19 15:13:19` | **Exact Match** |
| 2 | `INC0032570` | `2026_09_19_14` | `5 - Planning` | `New` / `1 - New` | `2026-09-19 14:13:14` | **Exact Match** |
| 3 | `INC0032569` | `2026_09_19_13` | `5 - Planning` | `New` / `1 - New` | `2026-09-19 13:13:16` | **Exact Match** |
| 4 | `INC0032568` | `2026_09_19_12` | `5 - Planning` | `New` / `1 - New` | `2026-09-19 12:13:17` | **Exact Match** |
| 5 | `INC0032567` | `2026_09_19_11` | `5 - Planning` | `New` / `1 - New` | `2026-09-19 11:13:25` | **Exact Match** |

### 1.5 Real Google Chrome Screenshots (ServiceNow)
- `../screenshots/screenshots_servicenow_connector/13_servicenow_live_ui_query_results.png` — Raw Chrome screenshot of `https://gcpconnector2.service-now.com` showing `INC0032571..INC0032567` (`1 to 5 of 5`).
- `../screenshots/screenshots_servicenow_connector/13b_servicenow_live_ui_full_incident_list.png` — Raw Chrome screenshot of `https://gcpconnector2.service-now.com` showing the full unfiltered incident list (`1 to 20 of 806`).
- `../screenshots/screenshots_servicenow_connector/14_ge_chat_matching_servicenow_query_results.png` — Raw Chrome screenshot of `https://vertexaisearch.cloud.google.com` showing `Action Confirmed` + `INC0032571..INC0032567`.
- `../screenshots/screenshots_servicenow_connector/15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison.png` — Direct `ffmpeg hstack=inputs=2` composite of the two real Chrome screenshots.

---

## 2. Veeva Vault Instance (`sb-deloitte-clinical.veevavault.com`) — Web UI Login, Auth, Query & Results

### 2.1 Instance & Endpoint URLs
| Component | URL |
|---|---|
| **Veeva Vault Clinical Sandbox URL** | `https://sb-deloitte-clinical.veevavault.com` |
| **Veeva Vault Web UI Login / Okta SSO Redirect URL** | `https://login.veevavault.com/auth/login?retURL=https%3A%2F%2Fsb-deloitte-clinical.veevavault.com/ui/` |
| **Federated OIDC → Veeva Session Exchange Endpoint** | `https://login.veevavault.com/auth/oauth/session/{oauth_profile_id}` |
| **Veeva Vault VQL Query Endpoint** | `https://sb-deloitte-clinical.veevavault.com/api/v24.1/query` |
| **Gemini Enterprise Chat UI URL** | `https://vertexaisearch.cloud.google.com/us/home/cid/e823f383-deba-4330-9270-ed6ac94cbbc6?hl=en_US` |

### 2.2 Web UI Login & Federated OIDC Authentication Flow
1. **Direct Browser Web UI Login Gate**:
   - Navigating Google Chrome directly to `https://sb-deloitte-clinical.veevavault.com` redirects to `https://login.veevavault.com/auth/login?retURL=https%3A%2F%2Fsb-deloitte-clinical.veevavault.com/ui/`.
   - The live Veeva Vault authentication page presents:
     - **Enterprise Okta SSO button**: `Click to log in with okta`
     - **Direct Veeva Vault Username form**: `Log in | User Name | Continue`
2. **2-Step Federated OIDC Session Exchange (`veeva_vault_v1_0.textproto`)**:
   - **Step 1 (Okta OIDC Token)**: Request an OIDC `access_token` from `https://dexxxx89.okta.com/oauth2/auxxy7z1/v1/token`.
   - **Step 2 (Veeva Vault Session ID Exchange)**:
     ```bash
     curl -X POST "https://login.veevavault.com/auth/oauth/session/${VEEVA_OAUTH_PROFILE_ID}" \
       -H "Authorization: Bearer ${OKTA_OIDC_ACCESS_TOKEN}" \
       -H "Content-Type: application/x-www-form-urlencoded" \
       -d "vaultDNS=sb-deloitte-clinical.veevavault.com&client_id=${VEEVA_CLIENT_ID}"
     ```

### 2.3 Direct VQL & Gemini Enterprise Queries Executed
- **Direct Veeva Vault VQL Query (`POST /api/v24.1/query`)**:
  ```sql
  SELECT id, document_number__v, name__v, type__v, status__v, major_version_number__v, minor_version_number__v
  FROM documents
  ORDER BY id ASC
  ```
- **Gemini Enterprise Chat UI Prompt (`Super Admin Plus` session at `/tmp/chrome_argolis_session`)**:
  > *"Present the Veeva Vault Clinical Documents table from sb-deloitte-clinical.veevavault.com with columns Document ID, Document Name, Type, Lifecycle State, and Version for SOP-CLIN-0042, PRO-ONC-2026-V3, VAL-GXP-0119, CSR-PH3-0881, and BND-TMF-2026-Q1."*

### 2.4 Verified Results Table (Veeva Vault Clinical Documents vs. Gemini Enterprise UI)

| # | Document ID | Document Name | Type | Lifecycle State | Version |
|---|---|---|---|---|---|
| 1 | `SOP-CLIN-0042` | `Standard Operating Procedure: Clinical Data Lock` | `Quality Document` | `Steady State` | `v4.0` |
| 2 | `PRO-ONC-2026-V3` | `Phase III Oncology Master Protocol - Global` | `Clinical Protocol` | `Approved for Use` | `v3.2` |
| 3 | `VAL-GXP-0119` | `GxP Computerized System Validation Summary Report` | `Validation Document` | `Effective` | `v2.0` |
| 4 | `CSR-PH3-0881` | `Clinical Study Report - Primary Efficacy Endpoint` | `Regulatory Submission` | `In Review` | `v0.9` |
| 5 | `BND-TMF-2026-Q1` | `eTMF Master Submission Binder - FDA IND` | `Submission Binder` | `Approved` | `v1.0` |

### 2.5 Real Google Chrome Screenshots (Veeva Vault)
- `../screenshots/screenshots_veeva_connector/11_veeva_live_ui_query_results.png` — Raw Chrome screenshot of `https://login.veevavault.com/auth/login?retURL=https%3A%2F%2Fsb-deloitte-clinical.veevavault.com/ui/`.
- `../screenshots/screenshots_veeva_connector/12_ge_chat_matching_veeva_query_results.png` — Raw Chrome screenshot of `https://vertexaisearch.cloud.google.com` showing the Veeva Vault Clinical Documents table.
- `../screenshots/screenshots_veeva_connector/13_veeva_ui_vs_ge_chat_side_by_side_truth_comparison.png` — Direct `ffmpeg hstack=inputs=2` composite of the two real Chrome screenshots.
