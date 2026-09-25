# Pre-Flight Environment, IAM, Regional Endpoint & Auth Validation Matrix

Used by `validateEnvironmentAndPlan()` when the user clicks **`[Validate]`** in the Demo Generator Chatbot.

## 1. Regional Endpoint Alignment Rules
- **`global`**: `https://discoveryengine.googleapis.com/v1alpha/projects/{project}/locations/global/collections/default_collection`
- **`us`**: `https://us-discoveryengine.googleapis.com/v1alpha/projects/{project}/locations/us/collections/default_collection`
- **`eu`**: `https://eu-discoveryengine.googleapis.com/v1alpha/projects/{project}/locations/eu/collections/default_collection`
- **Rule:** Both the GE App (`Engine`) and all attached `DataStores` / `Connectors` MUST reside in the identical multi-region (`global`, `us`, or `eu`).

## 2. Required GCP APIs & Service Agent IAM Bindings by Mode
| Integration Mode | Required APIs | Required IAM Roles on Service Agents | Required Auth Inputs |
| :--- | :--- | :--- | :--- |
| **Mode 1: BYOMCP Server (Cloud Run / Local)** | `discoveryengine.googleapis.com`, `run.googleapis.com`, `secretmanager.googleapis.com` | `roles/run.invoker` for `service-{NUM}@gcp-sa-discoveryengine.iam.gserviceaccount.com` | MCP Endpoint URL + OAuth/Bearer or IAM Invoker |
| **Mode 2: 1st-Party (1P) MCP Actions Connector** | `discoveryengine.googleapis.com`, `connectors.googleapis.com` | `roles/discoveryengine.admin`, `roles/secretmanager.secretAccessor` | Instance URL, Client ID, Client Secret, Auth URI, Token URI |
| **Mode 3: Federated Search & Data Ingestion** | `discoveryengine.googleapis.com`, `cloudscheduler.googleapis.com` | `roles/discoveryengine.editor` | OAuth 2.0 Client Credentials + Public URL Host (`b/549807440`) |
| **Mode 4: Cross-Cloud A2A Agent Gateway** | `discoveryengine.googleapis.com`, `aiplatform.googleapis.com` | `roles/aiplatform.user`, A2A Proxy Header Forwarding (`CB b/469707380`) | Registered A2A Card URL + JWT/OAuth Header Forwarding Config |
| **Mode 5: No-Code Agent Designer v2** | `discoveryengine.googleapis.com`, `aiplatform.googleapis.com` | `roles/discoveryengine.agentAdmin` | System Instructions + Grounding Data Store IDs |
