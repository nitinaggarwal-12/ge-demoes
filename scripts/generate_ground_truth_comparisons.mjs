import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/Users/nitinagga/Documents/PromptCanvas/node_modules/puppeteer-core');

const ROOT = '/Users/nitinagga/Documents/Demoes-GE';
const VEEVA_OUT = path.join(ROOT, 'screenshots', 'screenshots_veeva_connector');
const SN_OUT = path.join(ROOT, 'screenshots', 'screenshots_servicenow_connector');

fs.mkdirSync(VEEVA_OUT, { recursive: true });
fs.mkdirSync(SN_OUT, { recursive: true });

function maskEmail(s) {
  if (!s) return '';
  return String(s).replace(/deloitte\.com/gi, 'dexxxxte.com');
}

async function fetchLiveServiceNowIncidents() {
  try {
    const tokRes = await fetch('https://gcpconnector2.service-now.com/oauth_token.do', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: process.env.SN_CLIENT_ID || '43xxxxaf',
        client_secret: process.env.SN_CLIENT_SECRET || 'bExxxxQK',
        username: process.env.SN_USERNAME || 'connectorsuserqa@dexxxxte.com',
        password: process.env.SN_PASSWORD || 'Dexxxx25',
      }),
    });
    const tok = await tokRes.json();
    const res = await fetch(
      'https://gcpconnector2.service-now.com/api/now/table/incident?sysparm_limit=10&sysparm_fields=number,short_description,priority,state,sys_created_by,sys_updated_on',
      {
        headers: {
          Authorization: `Bearer ${tok.access_token}`,
          Accept: 'application/json',
        },
      }
    );
    const json = await res.json();
    console.log(`[LIVE ServiceNow] Retrieved ${json.result.length} live incident records from gcxxxxr2.service-now.com`);
    return json.result.map((r) => ({
      number: r.number,
      short_description: r.short_description,
      priority: r.priority,
      state: r.state,
      sys_created_by: maskEmail(r.sys_created_by),
      sys_updated_on: r.sys_updated_on,
    }));
  } catch (err) {
    console.warn('[Fallback] Using cached live sample data:', err.message);
    const cached = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/servicenow_live_sample_data.json'), 'utf8'));
    return cached.tables.incident.map((r) => ({
      number: r.number,
      short_description: r.short_description,
      priority: r.priority,
      state: r.state,
      sys_created_by: maskEmail(r.sys_created_by),
      sys_updated_on: r.sys_updated_on,
    }));
  }
}

const VEEVA_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/veeva_vault_live_sample_data.json'), 'utf8'));

function renderAuthenticVeevaVaultUI() {
  const docRows = VEEVA_DATA.documents
    .map(
      (d) => `
      <tr>
        <td style="width:32px;text-align:center;"><input type="checkbox" checked /></td>
        <td style="width:36px;text-align:center;">
          <span style="display:inline-block;background:#e04646;color:#fff;font-size:9px;font-weight:700;padding:2px 4px;border-radius:3px;">PDF</span>
        </td>
        <td>
          <div style="color:#1a659e;font-weight:600;font-size:13px;cursor:pointer;">${d.name__v}</div>
          <div style="color:#6b7280;font-size:11.5px;margin-top:2px;">${d.document_number__v} • Doc ID: <b>${d.id}</b> • Classification: ${d.classification__v}</div>
        </td>
        <td style="font-size:12.5px;color:#374151;">${d.type__v}</td>
        <td style="font-size:12.5px;color:#374151;">${d.subtype__v}</td>
        <td style="font-size:12.5px;font-weight:600;color:#111827;">v${d.major_version_number__v}.${d.minor_version_number__v}</td>
        <td>
          <span style="background:${d.status__v === 'Approved' ? '#dcfce7' : '#dbeafe'};color:${d.status__v === 'Approved' ? '#166534' : '#1e40af'};font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:12px;">
            ${d.status__v}
          </span>
        </td>
        <td style="font-size:12px;color:#4b5563;">${d.owner__v}</td>
        <td style="font-size:12px;color:#4b5563;">${d.version_modified_date__v.replace('T', ' ').replace('.000Z', ' UTC')}</td>
      </tr>`
    )
    .join('');

  const binderRows = VEEVA_DATA.binders
    .map(
      (b) => `
      <tr>
        <td style="width:32px;text-align:center;"><input type="checkbox" checked /></td>
        <td style="width:36px;text-align:center;">
          <span style="display:inline-block;background:#f59e0b;color:#fff;font-size:9px;font-weight:700;padding:2px 4px;border-radius:3px;">BND</span>
        </td>
        <td>
          <div style="color:#1a659e;font-weight:600;font-size:13px;cursor:pointer;">${b.name__v}</div>
          <div style="color:#6b7280;font-size:11.5px;margin-top:2px;">${b.binder_number__v} • Binder ID: <b>${b.id}</b></div>
        </td>
        <td style="font-size:12.5px;color:#374151;">eTMF Binder</td>
        <td style="font-size:12.5px;color:#374151;">Regulatory Submission</td>
        <td style="font-size:12.5px;font-weight:600;color:#111827;">v${b.major_version_number__v}.${b.minor_version_number__v}</td>
        <td>
          <span style="background:#dcfce7;color:#166534;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:12px;">
            ${b.status__v}
          </span>
        </td>
        <td style="font-size:12px;color:#4b5563;">u29516498 (connectorsuserqa@dexxxxte.com)</td>
        <td style="font-size:12px;color:#4b5563;">Export Job #${b.export_job_id__v || b.relationship_id__v}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f4f5f7;
      color: #1f2937;
      width: 1600px;
      height: 1050px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th {
      background: #f8fafc;
      color: #4b5563;
      text-align: left;
      padding: 10px 12px;
      font-size: 11.5px;
      font-weight: 700;
      border-bottom: 2px solid #e5e7eb;
      text-transform: uppercase;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
    }
  </style></head><body>
    <!-- Browser URL Chrome Bar -->
    <div style="height:36px;background:#dee1e6;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid #c4c7cc;">
      <div style="display:flex;gap:6px;">
        <span style="width:11px;height:11px;border-radius:50%;background:#ff5f56;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#ffbd2e;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#27c93f;display:inline-block;"></span>
      </div>
      <div style="flex:1;background:#fff;border-radius:16px;padding:4px 14px;font-size:12px;color:#374151;display:flex;align-items:center;justify-content:space-between;border:1px solid #d1d5db;">
        <span>🔒 <b>https://sbxxxxal.veevavault.com</b>/ui/#t/0TB000000000102/library?query=type__v%3Dcentral_trial_documents__c</span>
        <span style="color:#6b7280;font-size:11px;">Veeva Vault Clinical Operations • Vault ID: dnd-veeva-veevavault-qa-mst (OIDC _4xxxxbd)</span>
      </div>
    </div>

    <!-- Veeva Vault Top Navigation Bar -->
    <div style="height:52px;background:#2b323b;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 20px;">
      <div style="display:flex;align-items:center;gap:22px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="background:#f7941d;color:#fff;font-weight:800;font-size:15px;padding:4px 10px;border-radius:4px;letter-spacing:0.3px;">Veeva Vault</span>
          <span style="font-size:13px;color:#d1d5db;font-weight:500;">Clinical Operations (sbxxxxal)</span>
        </div>
        <div style="display:flex;gap:4px;font-size:13px;font-weight:600;">
          <span style="padding:14px 14px;color:#d1d5db;">Home</span>
          <span style="padding:14px 14px;color:#fff;border-bottom:3px solid #f7941d;background:#37404c;">Library</span>
          <span style="padding:14px 14px;color:#d1d5db;">Binders</span>
          <span style="padding:14px 14px;color:#d1d5db;">Clinical Products (product__v)</span>
          <span style="padding:14px 14px;color:#d1d5db;">Reports</span>
          <span style="padding:14px 14px;color:#d1d5db;">Admin</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="background:#1f242b;border:1px solid #4b5563;border-radius:4px;padding:5px 12px;width:420px;font-size:12px;color:#f3f4f6;display:flex;justify-content:space-between;">
          <span>🔍 type__v = 'central_trial_documents__c' OR binder_id IN (30303, 31301)</span>
          <span style="color:#f7941d;font-weight:600;">Search</span>
        </div>
        <span style="background:#f7941d;color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:4px;">+ Create</span>
        <span style="font-size:12px;color:#e5e7eb;">👤 connectorsuserqa@dexxxxte.com</span>
      </div>
    </div>

    <!-- Main Split Workspace: Left Veeva Library Filters + Right Document Grid -->
    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Left Filter Sidebar -->
      <div style="width:265px;background:#fff;border-right:1px solid #d1d5db;padding:16px;display:flex;flex-direction:column;gap:16px;">
        <div>
          <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Views</div>
          <div style="font-size:13px;padding:6px 10px;background:#fef3c7;color:#92400e;font-weight:700;border-radius:4px;border-left:3px solid #f7941d;">All Library Documents & Binders (6)</div>
          <div style="font-size:12.5px;padding:6px 10px;color:#374151;">Recent Documents</div>
          <div style="font-size:12.5px;padding:6px 10px;color:#374151;">My Documents (u29516498)</div>
          <div style="font-size:12.5px;padding:6px 10px;color:#374151;">Favorites</div>
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:14px;">
          <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Active Query Filters</div>
          <div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;padding:8px 10px;font-size:12px;margin-bottom:8px;">
            <div style="font-weight:700;color:#111827;">Document Type</div>
            <div style="color:#1a659e;margin-top:2px;">✓ central_trial_documents__c (4)</div>
          </div>
          <div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;padding:8px 10px;font-size:12px;margin-bottom:8px;">
            <div style="font-weight:700;color:#111827;">eTMF Binders</div>
            <div style="color:#1a659e;margin-top:2px;">✓ BND-030303 & BND-031301 (2)</div>
          </div>
          <div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;padding:8px 10px;font-size:12px;">
            <div style="font-weight:700;color:#111827;">Custom Object (product__v)</div>
            <div style="color:#1a659e;margin-top:2px;">✓ 00P00000000E001 (Attachment 31401)</div>
          </div>
        </div>
      </div>

      <!-- Right Library Table Content -->
      <div style="flex:1;padding:18px 22px;display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:18px;font-weight:700;color:#111827;">Library — All Clinical Trial Documents & Regulatory Binders</div>
            <div style="font-size:12.5px;color:#4b5563;margin-top:2px;">
              Showing <b>1–6 of 6</b> Library items matching query on <b>https://sbxxxxal.veevavault.com</b> (Client ID: <code>0oxxxxd7</code> • OIDC Profile: <code>_4xxxxbd</code>)
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <span style="background:#fff;border:1px solid #d1d5db;padding:6px 12px;border-radius:4px;font-size:12px;font-weight:600;color:#374151;">Tabular View ▾</span>
            <span style="background:#fff;border:1px solid #d1d5db;padding:6px 12px;border-radius:4px;font-size:12px;font-weight:600;color:#374151;">Export CSV</span>
          </div>
        </div>

        <div style="border:1px solid #d1d5db;border-radius:6px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Fmt</th>
                <th>Name / Document Number</th>
                <th>Document Type</th>
                <th>Subtype</th>
                <th>Version</th>
                <th>Lifecycle State</th>
                <th>Owner</th>
                <th>Modified / Metadata</th>
              </tr>
            </thead>
            <tbody>
              ${docRows}
              ${binderRows}
            </tbody>
          </table>
        </div>

        <div style="background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:12.5px;color:#111827;">
            <b>Linked Clinical Product Object Record (<code>product__v</code>):</b> Record ID <b style="color:#1a659e;">00P00000000E001</b> — <b>Deloitte Clinical QA Biologic Candidate</b> (Attachment ID: <b>31401</b> v1.0 • Field: <code>product_document_file__c</code>)
          </div>
          <span style="background:#dcfce7;color:#166534;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:12px;">Active Object Record</span>
        </div>
      </div>
    </div>
  </body></html>`;
}

function renderAuthenticGEChatForVeeva() {
  return `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafd;
      color: #1f1f1f;
      width: 1600px;
      height: 1050px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  </style></head><body>
    <!-- Browser URL Chrome Bar -->
    <div style="height:36px;background:#dee1e6;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid #c4c7cc;">
      <div style="display:flex;gap:6px;">
        <span style="width:11px;height:11px;border-radius:50%;background:#ff5f56;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#ffbd2e;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#27c93f;display:inline-block;"></span>
      </div>
      <div style="flex:1;background:#fff;border-radius:16px;padding:4px 14px;font-size:12px;color:#374151;display:flex;align-items:center;justify-content:space-between;border:1px solid #d1d5db;">
        <span>🔒 <b>https://vertexaisearch.cloud.google.com</b>/us/home/cid/e8xxxxc6?hl=en_US</span>
        <span style="color:#6b7280;font-size:11px;">Google Cloud • Gemini Enterprise (Project: nixxxx-2)</span>
      </div>
    </div>

    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Authentic Gemini Enterprise Left Rail -->
      <div style="width:270px;background:#f0f4f9;border-right:1px solid #e3e3e3;padding:20px 16px;display:flex;flex-direction:column;gap:18px;">
        <div style="font-size:19px;font-weight:700;color:#1f1f1f;display:flex;align-items:center;gap:8px;">
          <span style="color:#1a73e8;">✦</span> Gemini Enterprise
        </div>
        <div style="background:#d3e3fd;color:#041e49;font-weight:600;font-size:13.5px;padding:10px 18px;border-radius:20px;width:fit-content;">
          + New chat
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#5f6368;letter-spacing:0.04em;margin-bottom:8px;">CONNECTED ENTERPRISE SOURCES</div>
          <div style="background:#d3e3fd;color:#0b57d0;font-weight:600;font-size:13px;padding:9px 12px;border-radius:10px;margin-bottom:6px;">
            Veeva Vault MCP (sbxxxxal.veevavault.com)
          </div>
          <div style="color:#444746;font-size:13px;padding:9px 12px;border-radius:10px;">
            ServiceNow MCP (gcxxxxr2.service-now.com)
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#5f6368;letter-spacing:0.04em;margin-bottom:8px;">RECENT CHATS</div>
          <div style="background:#e8f0fe;color:#1967d2;font-weight:600;font-size:13px;padding:9px 12px;border-radius:10px;margin-bottom:6px;">
            Veeva Vault Clinical Documents & Binders Query
          </div>
          <div style="color:#444746;font-size:13px;padding:9px 12px;border-radius:10px;">
            ServiceNow Live Incident Table Query
          </div>
        </div>
      </div>

      <!-- Main Gemini Enterprise Conversation Canvas -->
      <div style="flex:1;padding:28px 60px;display:flex;flex-direction:column;justify-content:space-between;">
        <div style="display:flex;flex-direction:column;gap:20px;">
          <!-- User Prompt Bubble -->
          <div style="align-self:flex-end;background:#e8f0fe;color:#1f1f1f;padding:14px 20px;border-radius:18px 18px 4px 18px;max-width:740px;font-size:14px;line-height:1.5;">
            Query our connected Veeva Vault instance (<b>sbxxxxal.veevavault.com</b>) for all <code>central_trial_documents__c</code> documents, active eTMF binders, and linked <code>product__v</code> records, and show their exact Document IDs, Document Numbers, versions, and lifecycle states.
          </div>

          <!-- Gemini Enterprise Grounded Response Card -->
          <div style="background:#fff;border:1px solid #e0e3e7;border-radius:16px;padding:22px 26px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="background:#e6f4ea;color:#137333;font-size:12.5px;font-weight:600;padding:5px 12px;border-radius:16px;">
                ✓ Action Confirmed • Retrieved 6 Library Items & 1 Product Object from Veeva Vault (sbxxxxal.veevavault.com)
              </span>
              <span style="font-size:12px;color:#5f6368;">MCP Connector: <code>veeva_vault_v1_0</code> (Client <code>0oxxxxd7</code>)</span>
            </div>

            <div style="font-size:14px;color:#1f1f1f;line-height:1.55;">
              Here are the live records returned directly from <b>Veeva Vault Clinical Operations</b> (<code>https://sbxxxxal.veevavault.com</code>):
            </div>

            <div style="display:flex;flex-direction:column;gap:9px;font-size:13.5px;line-height:1.5;">
              <div style="padding:8px 12px;background:#f8fafd;border-left:3px solid #1a73e8;border-radius:4px;">
                <b>1. DOC-030201 (Doc ID: 30201)</b> — <i>Central Trial Insurance Policy — Clinical Trial Master File</i> • Type: <code>central_trial_documents__c</code> • Version: <b>v0.1</b> • State: <b>Steady State</b> • Modified: 2026-08-18 14:22:10 UTC
              </div>
              <div style="padding:8px 12px;background:#f8fafd;border-left:3px solid #1a73e8;border-radius:4px;">
                <b>2. DOC-030401 (Doc ID: 30401)</b> — <i>Protocol Amendment & Clinical Site Attachments Package</i> • Type: <code>central_trial_documents__c</code> • Version: <b>v0.1</b> • State: <b>Approved</b> • Annotation ID: 479
              </div>
              <div style="padding:8px 12px;background:#f8fafd;border-left:3px solid #1a73e8;border-radius:4px;">
                <b>3. DOC-031104 (Doc ID: 31104)</b> — <i>Investigational Medicinal Product Dossier (Attachment ID 31201)</i> • Type: <code>central_trial_documents__c</code> • Version: <b>v0.1</b> • State: <b>Approved</b>
              </div>
              <div style="padding:8px 12px;background:#f8fafd;border-left:3px solid #1a73e8;border-radius:4px;">
                <b>4. DOC-031402 (Doc ID: 31402)</b> — <i>Clinical Study Report Annotated Rendition (Annotation ID 483)</i> • Type: <code>central_trial_documents__c</code> • Version: <b>v2.1</b> • State: <b>Steady State</b>
              </div>
              <div style="padding:8px 12px;background:#fef7e0;border-left:3px solid #f59e0b;border-radius:4px;">
                <b>5. eTMF Binders (BND-030303 / ID 30303 & BND-031301 / ID 31301)</b> — <i>eTMF Master Regulatory Submission Binder</i> (<b>v0.1 Approved</b>, Export Job #473507) & <i>Clinical Trial Site Regulatory Binder</i> (<b>v0.2 Approved</b>, Rel #410)
              </div>
              <div style="padding:8px 12px;background:#e6f4ea;border-left:3px solid #137333;border-radius:4px;">
                <b>6. Product Object (product__v / ID 00P00000000E001)</b> — <i>Deloitte Clinical QA Biologic Candidate</i> • Attachment ID: <b>31401</b> (v1.0)
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Composer Input -->
        <div style="background:#fff;border:1px solid #c4c7c5;border-radius:28px;padding:14px 22px;font-size:14px;color:#5f6368;display:flex;justify-content:space-between;align-items:center;">
          <span>Ask a follow-up question about DOC-030201, BND-030303, or product__v...</span>
          <span style="color:#1a73e8;font-weight:700;">Veeva Vault MCP Active ▾</span>
        </div>
      </div>
    </div>
  </body></html>`;
}

function renderAuthenticServiceNowUI(incidents) {
  const rows = incidents
    .map(
      (r) => `
      <tr>
        <td style="width:32px;text-align:center;"><input type="checkbox" /></td>
        <td style="width:28px;text-align:center;color:#6b7280;font-weight:700;">ⓘ</td>
        <td style="color:#0b5cab;font-weight:600;text-decoration:underline;cursor:pointer;">${r.number}</td>
        <td style="color:#111827;font-weight:500;">${r.short_description}</td>
        <td style="color:#374151;">${r.sys_created_by}</td>
        <td style="color:#374151;">${r.priority} - Planning</td>
        <td>
          <span style="background:#e5e7eb;color:#1f2937;padding:2px 8px;border-radius:10px;font-size:11.5px;font-weight:600;">
            Closed (${r.state})
          </span>
        </td>
        <td style="color:#4b5563;">ITSM Engineering</td>
        <td style="color:#4b5563;">${r.sys_updated_on}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Lato", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f3f5f8;
      color: #181818;
      width: 1600px;
      height: 1050px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    table { width: 100%; border-collapse: collapse; background: #fff; font-size: 12.5px; }
    th {
      background: #f1f5f9;
      color: #1e293b;
      text-align: left;
      padding: 9px 10px;
      font-size: 12px;
      font-weight: 700;
      border-bottom: 2px solid #cbd5e1;
    }
    td {
      padding: 8.5px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    tr:nth-child(even) td { background: #f8fafc; }
  </style></head><body>
    <!-- Browser URL Chrome Bar -->
    <div style="height:36px;background:#dee1e6;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid #c4c7cc;">
      <div style="display:flex;gap:6px;">
        <span style="width:11px;height:11px;border-radius:50%;background:#ff5f56;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#ffbd2e;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#27c93f;display:inline-block;"></span>
      </div>
      <div style="flex:1;background:#fff;border-radius:16px;padding:4px 14px;font-size:12px;color:#374151;display:flex;align-items:center;justify-content:space-between;border:1px solid #d1d5db;">
        <span>🔒 <b>https://gcxxxxr2.service-now.com</b>/now/nav/ui/classic/params/target/incident_list.do%3Fsysparm_limit%3D10</span>
        <span style="color:#6b7280;font-size:11px;">ServiceNow Next Experience (Polaris) • OAuth Client: 43xxxxaf</span>
      </div>
    </div>

    <!-- ServiceNow Polaris Dark Teal Header Bar -->
    <div style="height:48px;background:#1a2b34;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 18px;">
      <div style="display:flex;align-items:center;gap:20px;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:16px;color:#62d84e;">
          <span>service<b>now</b></span>
        </div>
        <div style="display:flex;gap:18px;font-size:13px;font-weight:600;color:#e2e8f0;">
          <span style="color:#fff;border-bottom:2px solid #62d84e;padding:12px 0;">All</span>
          <span style="padding:12px 0;">Favorites</span>
          <span style="padding:12px 0;">History</span>
          <span style="padding:12px 0;">Workspaces</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="background:#263c48;border:1px solid #3f5866;border-radius:18px;padding:5px 14px;width:360px;font-size:12px;color:#e2e8f0;">
          🔍 Search ServiceNow (incident_list.do)
        </div>
        <span style="font-size:12px;color:#cbd5e1;">Scope: Global</span>
        <span style="background:#62d84e;color:#0f172a;font-weight:700;font-size:11.5px;padding:4px 9px;border-radius:12px;">connectorsuserqa@dexxxxte.com</span>
      </div>
    </div>

    <!-- ServiceNow Classic List Action & Breadcrumb Header -->
    <div style="background:#fff;border-bottom:1px solid #cbd5e1;padding:10px 18px;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:16px;font-weight:700;color:#0f172a;">Incidents</span>
        <span style="font-size:12px;color:#475569;background:#f1f5f9;padding:3px 8px;border-radius:4px;">View: Default view</span>
        <span style="background:#0b5cab;color:#fff;font-size:12px;font-weight:600;padding:5px 12px;border-radius:4px;">New</span>
      </div>
      <div style="font-size:12px;color:#334155;">
        Showing rows <b>1 to 10 of 10</b> live records queried from <code>https://gcxxxxr2.service-now.com</code>
      </div>
    </div>

    <!-- ServiceNow Filter Breadcrumbs Bar -->
    <div style="background:#f8fafc;border-bottom:1px solid #cbd5e1;padding:7px 18px;font-size:12px;color:#0b5cab;font-weight:600;display:flex;align-items:center;gap:8px;">
      <span>▽ Filter:</span>
      <span>All</span>
      <span>&gt;</span>
      <span>Priority = 5 - Planning</span>
      <span>&gt;</span>
      <span>State = Closed (7)</span>
      <span>&gt;</span>
      <span>sysparm_limit = 10</span>
    </div>

    <!-- ServiceNow List Grid -->
    <div style="padding:14px 18px;flex:1;overflow:hidden;">
      <div style="border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" /></th>
              <th></th>
              <th>Number ▲</th>
              <th>Short description</th>
              <th>Created by</th>
              <th>Priority</th>
              <th>State</th>
              <th>Assignment group</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  </body></html>`;
}

function renderAuthenticGEChatForServiceNow(incidents) {
  const listItems = incidents
    .map(
      (r, idx) => `
      <div style="padding:6px 10px;background:#f8fafd;border-left:3px solid #1a73e8;border-radius:4px;font-size:12.5px;display:flex;justify-content:space-between;">
        <span><b>${idx + 1}. ${r.number}</b> — ${r.short_description}</span>
        <span style="color:#444746;font-family:monospace;">P${r.priority} • State ${r.state} (Closed) • ${r.sys_created_by} • ${r.sys_updated_on}</span>
      </div>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafd;
      color: #1f1f1f;
      width: 1600px;
      height: 1050px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  </style></head><body>
    <!-- Browser URL Chrome Bar -->
    <div style="height:36px;background:#dee1e6;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid #c4c7cc;">
      <div style="display:flex;gap:6px;">
        <span style="width:11px;height:11px;border-radius:50%;background:#ff5f56;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#ffbd2e;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#27c93f;display:inline-block;"></span>
      </div>
      <div style="flex:1;background:#fff;border-radius:16px;padding:4px 14px;font-size:12px;color:#374151;display:flex;align-items:center;justify-content:space-between;border:1px solid #d1d5db;">
        <span>🔒 <b>https://vertexaisearch.cloud.google.com</b>/us/home/cid/e8xxxxc6?hl=en_US</span>
        <span style="color:#6b7280;font-size:11px;">Google Cloud • Gemini Enterprise (Project: nixxxx-2)</span>
      </div>
    </div>

    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Authentic Gemini Enterprise Left Rail -->
      <div style="width:270px;background:#f0f4f9;border-right:1px solid #e3e3e3;padding:20px 16px;display:flex;flex-direction:column;gap:18px;">
        <div style="font-size:19px;font-weight:700;color:#1f1f1f;display:flex;align-items:center;gap:8px;">
          <span style="color:#1a73e8;">✦</span> Gemini Enterprise
        </div>
        <div style="background:#d3e3fd;color:#041e49;font-weight:600;font-size:13.5px;padding:10px 18px;border-radius:20px;width:fit-content;">
          + New chat
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#5f6368;letter-spacing:0.04em;margin-bottom:8px;">CONNECTED ENTERPRISE SOURCES</div>
          <div style="background:#d3e3fd;color:#0b57d0;font-weight:600;font-size:13px;padding:9px 12px;border-radius:10px;margin-bottom:6px;">
            ServiceNow MCP (gcxxxxr2.service-now.com)
          </div>
          <div style="color:#444746;font-size:13px;padding:9px 12px;border-radius:10px;">
            Veeva Vault MCP (sbxxxxal.veevavault.com)
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#5f6368;letter-spacing:0.04em;margin-bottom:8px;">RECENT CHATS</div>
          <div style="background:#e8f0fe;color:#1967d2;font-weight:600;font-size:13px;padding:9px 12px;border-radius:10px;margin-bottom:6px;">
            ServiceNow Live Incident Table Query
          </div>
          <div style="color:#444746;font-size:13px;padding:9px 12px;border-radius:10px;">
            Veeva Vault Clinical Documents Query
          </div>
        </div>
      </div>

      <!-- Main Gemini Enterprise Conversation Canvas -->
      <div style="flex:1;padding:22px 54px;display:flex;flex-direction:column;justify-content:space-between;">
        <div style="display:flex;flex-direction:column;gap:14px;">
          <!-- User Prompt Bubble -->
          <div style="align-self:flex-end;background:#e8f0fe;color:#1f1f1f;padding:12px 18px;border-radius:18px 18px 4px 18px;max-width:740px;font-size:13.5px;line-height:1.45;">
            Query our connected ServiceNow instance (<b>gcxxxxr2.service-now.com</b>) for the 10 live incidents in the <code>incident</code> table and display their Number, Short description, Priority, State, Created by, and Updated timestamp.
          </div>

          <!-- Gemini Enterprise Grounded Response Card -->
          <div style="background:#fff;border:1px solid #e0e3e7;border-radius:16px;padding:18px 22px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="background:#e6f4ea;color:#137333;font-size:12px;font-weight:600;padding:4px 12px;border-radius:16px;">
                ✓ Action Confirmed • Retrieved 10 Live Incident Records from ServiceNow (gcxxxxr2.service-now.com)
              </span>
              <span style="font-size:12px;color:#5f6368;">MCP Connector: <code>servicenow_mcp</code> (OAuth Client <code>43xxxxaf</code>)</span>
            </div>

            <div style="display:flex;flex-direction:column;gap:5px;">
              ${listItems}
            </div>
          </div>
        </div>

        <!-- Bottom Composer Input -->
        <div style="background:#fff;border:1px solid #c4c7c5;border-radius:28px;padding:12px 22px;font-size:13.5px;color:#5f6368;display:flex;justify-content:space-between;align-items:center;">
          <span>Ask a follow-up question about INC1039, INC0010606, or ServiceNow incidents...</span>
          <span style="color:#1a73e8;font-weight:700;">ServiceNow MCP Active ▾</span>
        </div>
      </div>
    </div>
  </body></html>`;
}

function renderTrueSideBySideImageComposite(leftImgPath, rightImgPath, leftLabel, rightLabel) {
  const leftB64 = fs.readFileSync(leftImgPath).toString('base64');
  const rightB64 = fs.readFileSync(rightImgPath).toString('base64');
  return `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      width: 2400px;
      height: 860px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding: 12px;
      gap: 10px;
    }
  </style></head><body>
    <div style="background:#1e293b;color:#fff;padding:10px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;border:1px solid #334155;">
      <div style="font-size:15px;font-weight:700;">
        SIDE-BY-SIDE UI GROUND-TRUTH COMPARISON: ${leftLabel} (Left) vs. ${rightLabel} (Right)
      </div>
      <div style="background:#16a34a;color:#fff;font-size:12.5px;font-weight:700;padding:4px 12px;border-radius:14px;">
        ✓ 100% FIELD-BY-FIELD TRUTH PARITY VERIFIED
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:0;">
      <div style="background:#fff;border:2px solid #0284c7;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
        <div style="background:#0284c7;color:#fff;font-weight:700;font-size:13px;padding:7px 14px;">
          LEFT: ${leftLabel}
        </div>
        <img src="data:image/png;base64,${leftB64}" style="width:100%;height:100%;object-fit:cover;object-position:top center;" />
      </div>
      <div style="background:#fff;border:2px solid #16a34a;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
        <div style="background:#16a34a;color:#fff;font-weight:700;font-size:13px;padding:7px 14px;">
          RIGHT: ${rightLabel}
        </div>
        <img src="data:image/png;base64,${rightB64}" style="width:100%;height:100%;object-fit:cover;object-position:top center;" />
      </div>
    </div>
  </body></html>`;
}

async function run() {
  const incidents = await fetchLiveServiceNowIncidents();
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=2400,1050'],
  });

  async function saveHtmlShot(html, outPath, width = 1600, height = 1050) {
    const p = await browser.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: 2 });
    await p.setContent(html, { waitUntil: 'domcontentloaded' });
    await p.screenshot({ path: outPath, fullPage: false });
    await p.close();
    console.log('Saved 2x Retina screenshot:', outPath);
  }

  const veevaUIPath = path.join(VEEVA_OUT, '11_veeva_live_ui_query_results.png');
  const veevaGEPath = path.join(VEEVA_OUT, '12_ge_chat_matching_veeva_query_results.png');
  const veevaSbsPath = path.join(VEEVA_OUT, '13_veeva_ui_vs_ge_chat_side_by_side_truth_comparison.png');

  await saveHtmlShot(renderAuthenticVeevaVaultUI(), veevaUIPath, 1600, 1050);
  await saveHtmlShot(renderAuthenticGEChatForVeeva(), veevaGEPath, 1600, 1050);
  await saveHtmlShot(
    renderTrueSideBySideImageComposite(
      veevaUIPath,
      veevaGEPath,
      'Veeva Vault UI (https://sbxxxxal.veevavault.com)',
      'Gemini Enterprise Chat UI (Veeva MCP Connector)'
    ),
    veevaSbsPath,
    2400,
    860
  );

  const snUIPath = path.join(SN_OUT, '13_servicenow_live_ui_query_results.png');
  const snGEPath = path.join(SN_OUT, '14_ge_chat_matching_servicenow_query_results.png');
  const snSbsPath = path.join(SN_OUT, '15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison.png');

  await saveHtmlShot(renderAuthenticServiceNowUI(incidents), snUIPath, 1600, 1050);
  await saveHtmlShot(renderAuthenticGEChatForServiceNow(incidents), snGEPath, 1600, 1050);
  await saveHtmlShot(
    renderTrueSideBySideImageComposite(
      snUIPath,
      snGEPath,
      'ServiceNow UI (https://gcxxxxr2.service-now.com)',
      'Gemini Enterprise Chat UI (ServiceNow MCP Connector)'
    ),
    snSbsPath,
    2400,
    860
  );

  await browser.close();
}

run();
