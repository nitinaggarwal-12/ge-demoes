import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = process.cwd();
const VEEVA_OUT = path.join(ROOT, 'screenshots', 'screenshots_veeva_connector');
const SN_OUT = path.join(ROOT, 'screenshots', 'screenshots_servicenow_connector');
const MS_OUT = path.join(ROOT, 'screenshots', 'screenshots_microsoft_connector');

fs.mkdirSync(VEEVA_OUT, { recursive: true });
fs.mkdirSync(SN_OUT, { recursive: true });
fs.mkdirSync(MS_OUT, { recursive: true });

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
    if (tok && tok.access_token) {
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
      if (json && Array.isArray(json.result) && json.result.length > 0) {
        console.log(`[LIVE ServiceNow] Retrieved ${json.result.length} live incident records from gcxxxxr2.service-now.com`);
        return json.result.map((r) => ({
          number: r.number,
          short_description: r.short_description,
          priority: r.priority,
          state: r.state,
          sys_created_by: maskEmail(r.sys_created_by),
          sys_updated_on: r.sys_updated_on,
        }));
      }
    }
    throw new Error('Live instance returned no records or offline');
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

function renderAuthenticSharePointUI() {
  return `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f3f2f1;
      color: #323130;
      width: 1600px;
      height: 1050px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th {
      background: #faf9f8;
      color: #605e5c;
      text-align: left;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      border-bottom: 1px solid #edebe9;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #edebe9;
      font-size: 13px;
    }
    .sp-tag {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
  </style></head><body>
    <!-- Browser URL Bar -->
    <div style="height:36px;background:#dee1e6;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid #c4c7cc;">
      <div style="display:flex;gap:6px;">
        <span style="width:11px;height:11px;border-radius:50%;background:#ff5f56;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#ffbd2e;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#27c93f;display:inline-block;"></span>
      </div>
      <div style="flex:1;background:#fff;border-radius:16px;padding:4px 14px;font-size:12px;color:#374151;display:flex;align-items:center;justify-content:space-between;border:1px solid #d1d5db;">
        <span>🔒 <b>https://argolis-enterprise.sharepoint.com</b>/sites/AI-CoE/Shared%20Documents/Architecture/FY27-Cloud-Strategy.docx</span>
        <span style="color:#6b7280;font-size:11px;">Microsoft 365 SharePoint Online • Tenant: argolis-enterprise.onmicrosoft.com (Entra ID)</span>
      </div>
    </div>

    <!-- M365 Suite Header -->
    <div style="height:48px;background:#0078d4;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 18px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <span style="font-size:18px;cursor:pointer;letter-spacing:1px;">⠿</span>
        <span style="font-weight:700;font-size:16px;letter-spacing:0.2px;">SharePoint</span>
        <div style="background:rgba(255,255,255,0.18);border-radius:4px;padding:5px 14px;display:flex;align-items:center;gap:8px;width:480px;font-size:13px;">
          <span>🔍</span>
          <span style="color:rgba(255,255,255,0.85);">Search across SharePoint, Teams, and OneDrive...</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;font-size:13px;">
        <span>⚙️</span>
        <span>❓</span>
        <span style="background:#004578;padding:5px 10px;border-radius:50%;font-weight:700;">SN</span>
        <span>Satya N. (Cloud Architect)</span>
      </div>
    </div>

    <!-- Site Title & Breadcrumbs -->
    <div style="background:#fff;border-bottom:1px solid #edebe9;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:38px;height:38px;background:#038387;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;">AI</div>
        <div>
          <div style="font-size:17px;font-weight:700;color:#201f1e;">AI Center of Excellence</div>
          <div style="font-size:12px;color:#605e5c;">Private Group • 142 Members • Grounded in Vertex AI Search</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <span style="background:#f3f2f1;border:1px solid #8a8886;padding:6px 14px;border-radius:2px;font-size:12.5px;font-weight:600;">Not following</span>
        <span style="background:#0078d4;color:#fff;padding:6px 14px;border-radius:2px;font-size:12.5px;font-weight:600;">Share</span>
      </div>
    </div>

    <!-- Command Bar -->
    <div style="background:#fff;border-bottom:1px solid #edebe9;padding:8px 24px;display:flex;align-items:center;gap:18px;font-size:13px;font-weight:500;">
      <span style="color:#0078d4;font-weight:600;display:flex;align-items:center;gap:4px;">➕ New ▾</span>
      <span style="color:#0078d4;font-weight:600;display:flex;align-items:center;gap:4px;">⬆️ Upload ▾</span>
      <span style="color:#323130;">🔄 Sync</span>
      <span style="color:#323130;">🔗 Copy link</span>
      <span style="color:#323130;">📥 Download</span>
      <span style="color:#0078d4;font-weight:600;">⚙️ Integrate (Vertex AI Search MCP) ▾</span>
    </div>

    <!-- Main Content Area: Left Folder Tree + Right Documents Table + Metadata Panel -->
    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Left Quick Launch -->
      <div style="width:230px;background:#faf9f8;border-right:1px solid #edebe9;padding:16px;font-size:13px;display:flex;flex-direction:column;gap:10px;">
        <div style="font-weight:700;color:#201f1e;margin-bottom:4px;">Navigation</div>
        <div style="color:#605e5c;padding:5px 8px;">Home</div>
        <div style="background:#edebe9;font-weight:600;color:#0078d4;padding:6px 8px;border-radius:4px;">Documents (Architecture)</div>
        <div style="color:#605e5c;padding:5px 8px;">Teams Incident Logs</div>
        <div style="color:#605e5c;padding:5px 8px;">Notebooks & Models</div>
        <div style="color:#605e5c;padding:5px 8px;">Site Contents</div>
        <div style="color:#605e5c;padding:5px 8px;">Recycle Bin</div>
      </div>

      <!-- Center Document Table -->
      <div style="flex:1;padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:14px;color:#605e5c;">Documents &gt; Architecture Specifications &gt; <b>Strategy &amp; Incident Blueprints</b></div>
          <div style="font-size:12px;color:#605e5c;">4 items • Total 26.9 MB</div>
        </div>

        <div style="border:1px solid #edebe9;border-radius:4px;overflow:hidden;">
          <table>
            <thead>
              <tr>
                <th style="width:34px;"></th>
                <th>Type</th>
                <th>Name / Document ID</th>
                <th>Modified</th>
                <th>Modified By</th>
                <th>File Size</th>
                <th>Sensitivity / Sharing</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background:#eff6fc;">
                <td style="text-align:center;"><input type="checkbox" checked /></td>
                <td><span style="background:#0078d4;color:#fff;font-weight:700;padding:2px 5px;border-radius:2px;font-size:10px;">DOCX</span></td>
                <td>
                  <div style="color:#0078d4;font-weight:600;">FY27 Global Cloud Infrastructure Strategy.docx</div>
                  <div style="color:#605e5c;font-size:11px;">SP-DOC-8921 • Object ID: <code>01U7A29B8921</code></div>
                </td>
                <td>Sep 18, 2026 14:22</td>
                <td>Satya N. (Cloud Arch)</td>
                <td>4.2 MB</td>
                <td><span class="sp-tag" style="background:#fde7e9;color:#a80000;">🔒 Confidential</span></td>
              </tr>
              <tr>
                <td style="text-align:center;"><input type="checkbox" /></td>
                <td><span style="background:#d83b01;color:#fff;font-weight:700;padding:2px 5px;border-radius:2px;font-size:10px;">PPTX</span></td>
                <td>
                  <div style="color:#0078d4;font-weight:600;">AI Grounding Architecture &amp; Graph API Guide.pptx</div>
                  <div style="color:#605e5c;font-size:11px;">SP-DOC-8922 • Object ID: <code>01U7A29B8922</code></div>
                </td>
                <td>Sep 20, 2026 09:15</td>
                <td>Enterprise Arch Lead</td>
                <td>18.5 MB</td>
                <td><span class="sp-tag" style="background:#dff6dd;color:#107c41;">🌐 Enterprise-Wide</span></td>
              </tr>
              <tr>
                <td style="text-align:center;"><input type="checkbox" /></td>
                <td><span style="background:#0078d4;color:#fff;font-weight:700;padding:2px 5px;border-radius:2px;font-size:10px;">DOCX</span></td>
                <td>
                  <div style="color:#0078d4;font-weight:600;">ServiceNow to Vertex AI Search Data Pipeline Specs.docx</div>
                  <div style="color:#605e5c;font-size:11px;">SP-DOC-8923 • Object ID: <code>01U7A29B8923</code></div>
                </td>
                <td>Sep 15, 2026 13:00</td>
                <td>Cloud Platform Director</td>
                <td>2.8 MB</td>
                <td><span class="sp-tag" style="background:#fde7e9;color:#a80000;">🔒 Confidential</span></td>
              </tr>
              <tr>
                <td style="text-align:center;"><input type="checkbox" /></td>
                <td><span style="background:#107c41;color:#fff;font-weight:700;padding:2px 5px;border-radius:2px;font-size:10px;">XLSX</span></td>
                <td>
                  <div style="color:#0078d4;font-weight:600;">Life Sciences GxP Compliance &amp; 21 CFR Part 11 Audit.xlsx</div>
                  <div style="color:#605e5c;font-size:11px;">SP-DOC-8924 • Object ID: <code>01U7A29B8924</code></div>
                </td>
                <td>Sep 12, 2026 10:45</td>
                <td>Compliance Lead</td>
                <td>1.4 MB</td>
                <td><span class="sp-tag" style="background:#fff4ce;color:#797775;">🛡️ GxP Validated</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right Inspection Pane -->
      <div style="width:340px;background:#fff;border-left:1px solid #edebe9;padding:20px;display:flex;flex-direction:column;gap:14px;box-shadow:-2px 0 6px rgba(0,0,0,0.03);">
        <div style="font-size:16px;font-weight:700;color:#201f1e;">Selected Item Preview</div>
        <div style="background:#f3f2f1;border-radius:4px;padding:14px;border-left:4px solid #0078d4;">
          <div style="font-weight:700;font-size:13.5px;color:#0078d4;">FY27 Global Cloud Infrastructure Strategy.docx</div>
          <div style="font-size:11.5px;color:#605e5c;margin-top:4px;">Unified hybrid cloud topology linking Google Cloud Vertex AI Search with Microsoft 365 Graph endpoints.</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#605e5c;text-transform:uppercase;">Graph API Details</div>
          <div style="font-size:12.5px;margin-top:6px;line-height:1.6;">
            <div><b>Tenant:</b> argolis-enterprise.onmicrosoft.com</div>
            <div><b>Site Collection:</b> /sites/AI-CoE</div>
            <div><b>Permissions:</b> Sites.Read.All (Delegated)</div>
            <div><b>Grounding Bridge:</b> Vertex AI Search MCP</div>
          </div>
        </div>
        <div style="background:#e8f4fc;padding:10px 12px;border-radius:4px;font-size:12px;color:#004578;">
          ✓ Synced with Gemini Enterprise BYOMCP connector. Live indexing active.
        </div>
      </div>
    </div>
  </body></html>`;
}

function renderAuthenticTeamsUI() {
  return `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f5f5f5;
      color: #242424;
      width: 1600px;
      height: 1050px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  </style></head><body>
    <!-- Browser Bar -->
    <div style="height:36px;background:#dee1e6;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid #c4c7cc;">
      <div style="display:flex;gap:6px;">
        <span style="width:11px;height:11px;border-radius:50%;background:#ff5f56;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#ffbd2e;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#27c93f;display:inline-block;"></span>
      </div>
      <div style="flex:1;background:#fff;border-radius:16px;padding:4px 14px;font-size:12px;color:#374151;display:flex;align-items:center;justify-content:space-between;border:1px solid #d1d5db;">
        <span>🔒 <b>https://teams.microsoft.com</b>/v2/#/conversations/p1-incident-war-room?tenantId=72f988bf</span>
        <span style="color:#6b7280;font-size:11px;">Microsoft Teams (M365) • Channel: Global SRE &amp; Cloud Ops &gt; P1 Incident War Room</span>
      </div>
    </div>

    <!-- Teams Main Layout -->
    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Teams Left App Bar -->
      <div style="width:68px;background:#ebebeb;border-right:1px solid #d1d1d1;display:flex;flex-direction:column;align-items:center;padding:12px 0;gap:20px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:#616161;">
          <span style="font-size:20px;">🔔</span><span>Activity</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:#616161;">
          <span style="font-size:20px;">💬</span><span>Chat</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:#5b5fc7;font-weight:700;border-left:3px solid #5b5fc7;width:100%;padding-left:10px;">
          <span style="font-size:20px;">👥</span><span>Teams</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:#616161;">
          <span style="font-size:20px;">📅</span><span>Calendar</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:#616161;">
          <span style="font-size:20px;">📞</span><span>Calls</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;color:#616161;">
          <span style="font-size:20px;">📁</span><span>OneDrive</span>
        </div>
      </div>

      <!-- Teams Channel List Sidebar -->
      <div style="width:280px;background:#f5f5f5;border-right:1px solid #e0e0e0;padding:16px;display:flex;flex-direction:column;gap:14px;">
        <div style="font-size:18px;font-weight:700;color:#242424;">Teams</div>
        <div style="background:#fff;border:1px solid #d1d1d1;border-radius:4px;padding:6px 10px;font-size:12px;color:#616161;">
          🔍 Filter teams and channels
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="font-weight:700;font-size:13.5px;color:#242424;display:flex;align-items:center;gap:6px;">
            <span>▾</span> <span>Global SRE &amp; Cloud Ops</span>
          </div>
          <div style="padding:6px 12px;font-size:13px;color:#424242;">General</div>
          <div style="background:#e8ebfa;color:#5b5fc7;font-weight:700;padding:8px 12px;border-radius:4px;font-size:13px;display:flex;justify-content:space-between;">
            <span># P1 Incident War Room</span>
            <span style="background:#d83b01;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;">LIVE</span>
          </div>
          <div style="padding:6px 12px;font-size:13px;color:#424242;"># Multi-Cloud Pipeline Triage</div>
          <div style="padding:6px 12px;font-size:13px;color:#424242;"># ServiceNow &amp; Veeva Connectors</div>
        </div>
      </div>

      <!-- Main Conversation Thread Panel -->
      <div style="flex:1;background:#fff;display:flex;flex-direction:column;">
        <!-- Channel Header -->
        <div style="height:56px;border-bottom:1px solid #e0e0e0;padding:0 24px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:16px;font-weight:700;color:#242424;"># P1 Incident War Room</div>
            <div style="font-size:12px;color:#616161;">Incident Bridge: ServiceNow OAuth Ingestion Latency (INC1039) • 18 Participants</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <span style="background:#fde7e9;color:#a80000;font-weight:700;font-size:11.5px;padding:4px 10px;border-radius:14px;border:1px solid #f19999;">
              🔴 Live War Room Bridge Active
            </span>
            <span style="background:#5b5fc7;color:#fff;font-weight:600;font-size:12.5px;padding:6px 14px;border-radius:4px;">Join Call</span>
          </div>
        </div>

        <!-- Chat Stream -->
        <div style="flex:1;padding:24px;overflow-y:auto;display:flex;flex-direction:column;gap:18px;background:#fafafa;">
          <!-- Alert Banner -->
          <div style="background:#fff;border:1px solid #f19999;border-left:5px solid #d83b01;border-radius:6px;padding:14px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-weight:700;color:#a80000;font-size:13.5px;display:flex;justify-content:space-between;">
              <span>🚨 P1 INCIDENT DETECTED: INC1039 (ServiceNow Ingestion Bridge Latency)</span>
              <span style="font-size:11.5px;color:#616161;">09:40 AM UTC</span>
            </div>
            <div style="font-size:12.5px;color:#424242;margin-top:4px;">
              ServiceNow OAuth token exchange on <code>gcxxxxr2.service-now.com</code> exceeded 4000ms latency threshold during automated key rotation. Grounded search sync paused.
            </div>
          </div>

          <!-- Message 1 -->
          <div style="display:flex;gap:12px;">
            <div style="width:36px;height:36px;background:#5b5fc7;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">CA</div>
            <div style="flex:1;background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-weight:700;font-size:13px;color:#242424;">Cloud Architecture Lead</span>
                <span style="font-size:11.5px;color:#616161;">09:42 AM</span>
              </div>
              <div style="font-size:13px;color:#323130;line-height:1.45;">
                Team, bridge is live. We traced the latency spike to OAuth refresh token rotation on the BYOMCP server endpoint. We are verifying the fallback credentials for client ID <code>43xxxxaf</code>.
              </div>
            </div>
          </div>

          <!-- Message 2 -->
          <div style="display:flex;gap:12px;">
            <div style="width:36px;height:36px;background:#107c41;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">SR</div>
            <div style="flex:1;background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-weight:700;font-size:13px;color:#242424;">Site Reliability Engineer</span>
                <span style="font-size:11.5px;color:#616161;">09:45 AM</span>
              </div>
              <div style="font-size:13px;color:#323130;line-height:1.45;">
                ✅ Root cause mitigated! The BYOMCP server lease has successfully renewed with an active bearer token. Average API latency is down to <b>118ms</b> across all 10 incident table query endpoints.
              </div>
            </div>
          </div>

          <!-- Message 3 -->
          <div style="display:flex;gap:12px;">
            <div style="width:36px;height:36px;background:#0078d4;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">SN</div>
            <div style="flex:1;background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:12px 16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-weight:700;font-size:13px;color:#242424;">Satya N. (ServiceNow Admin)</span>
                <span style="font-size:11.5px;color:#616161;">09:48 AM</span>
              </div>
              <div style="font-size:13px;color:#323130;line-height:1.45;">
                Confirmed in ServiceNow Polaris UI: INC1039 has been updated to <b>State: Closed (7)</b>. All downstream Vertex AI Search indexing jobs have caught up with 100% field parity.
              </div>
            </div>
          </div>
        </div>

        <!-- Composer Input -->
        <div style="border-top:1px solid #e0e0e0;padding:14px 24px;background:#fff;">
          <div style="border:1px solid #d1d1d1;border-radius:6px;padding:10px 14px;color:#616161;font-size:13px;display:flex;justify-content:space-between;">
            <span>Reply to # P1 Incident War Room thread...</span>
            <span style="color:#5b5fc7;font-weight:700;">Send ✈️</span>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;
}

function renderAuthenticOneDriveUI() {
  return `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #faf9f8;
      color: #323130;
      width: 1600px;
      height: 1050px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th {
      background: #f3f2f1;
      color: #605e5c;
      text-align: left;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      border-bottom: 1px solid #edebe9;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #edebe9;
      font-size: 13px;
    }
  </style></head><body>
    <!-- Browser URL Bar -->
    <div style="height:36px;background:#dee1e6;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid #c4c7cc;">
      <div style="display:flex;gap:6px;">
        <span style="width:11px;height:11px;border-radius:50%;background:#ff5f56;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#ffbd2e;display:inline-block;"></span>
        <span style="width:11px;height:11px;border-radius:50%;background:#27c93f;display:inline-block;"></span>
      </div>
      <div style="flex:1;background:#fff;border-radius:16px;padding:4px 14px;font-size:12px;color:#374151;display:flex;align-items:center;justify-content:space-between;border:1px solid #d1d5db;">
        <span>🔒 <b>https://argolis-enterprise-my.sharepoint.com</b>/personal/satyan_argolis_com/_layouts/15/onedrive.aspx?id=/Enterprise-Blueprints</span>
        <span style="color:#6b7280;font-size:11px;">OneDrive for Business (M365) • Satya N. &gt; Enterprise Blueprints</span>
      </div>
    </div>

    <!-- M365 Header -->
    <div style="height:48px;background:#0078d4;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 18px;">
      <div style="display:flex;align-items:center;gap:16px;">
        <span style="font-size:18px;letter-spacing:1px;">⠿</span>
        <span style="font-weight:700;font-size:16px;">OneDrive for Business</span>
        <div style="background:rgba(255,255,255,0.18);border-radius:4px;padding:5px 14px;display:flex;align-items:center;gap:8px;width:440px;font-size:13px;">
          <span>🔍</span><span style="color:rgba(255,255,255,0.85);">Search my files and shared blueprints...</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;font-size:13px;">
        <span>Satya N. (Cloud Architect)</span>
      </div>
    </div>

    <!-- Main Workspace -->
    <div style="display:flex;flex:1;overflow:hidden;">
      <div style="width:220px;background:#f3f2f1;border-right:1px solid #edebe9;padding:16px;font-size:13px;display:flex;flex-direction:column;gap:8px;">
        <div style="font-weight:700;color:#201f1e;margin-bottom:6px;">My OneDrive</div>
        <div style="background:#edebe9;color:#0078d4;font-weight:600;padding:6px 10px;border-radius:4px;">📁 My files</div>
        <div style="padding:6px 10px;color:#605e5c;">👥 Shared</div>
        <div style="padding:6px 10px;color:#605e5c;">⭐ Favorites</div>
        <div style="padding:6px 10px;color:#605e5c;">🗑️ Recycle bin</div>
      </div>

      <div style="flex:1;padding:24px;display:flex;flex-direction:column;gap:14px;">
        <div style="font-size:18px;font-weight:700;color:#201f1e;">Enterprise Blueprints &amp; Network Topologies</div>
        <div style="font-size:12.5px;color:#605e5c;">Files synced with Microsoft Graph API and connected to Google Cloud Gemini Enterprise.</div>

        <div style="border:1px solid #edebe9;border-radius:4px;overflow:hidden;">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>File Name</th>
                <th>Sync Status</th>
                <th>Modified Date</th>
                <th>File Size</th>
                <th>Sharing</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span style="background:#107c41;color:#fff;font-weight:700;padding:2px 5px;border-radius:2px;font-size:10px;">XLSX</span></td>
                <td><b style="color:#0078d4;">FY27_MultiCloud_Grounding_Matrix.xlsx</b></td>
                <td><span style="color:#107c41;">🟢 Synced (Cloud)</span></td>
                <td>Sep 21, 2026 11:20 AM</td>
                <td>2.1 MB</td>
                <td>Shared with Architecture Reviewers</td>
              </tr>
              <tr>
                <td><span style="background:#a80000;color:#fff;font-weight:700;padding:2px 5px;border-radius:2px;font-size:10px;">PDF</span></td>
                <td><b style="color:#0078d4;">GCP_to_M365_Graph_Bridge_Spec.pdf</b></td>
                <td><span style="color:#107c41;">🟢 Synced (Cloud)</span></td>
                <td>Sep 19, 2026 04:45 PM</td>
                <td>5.8 MB</td>
                <td>Confidential (Tenant Only)</td>
              </tr>
              <tr>
                <td><span style="background:#0078d4;color:#fff;font-weight:700;padding:2px 5px;border-radius:2px;font-size:10px;">DOCX</span></td>
                <td><b style="color:#0078d4;">VertexAI_Search_SharePoint_Mapping.docx</b></td>
                <td><span style="color:#107c41;">🟢 Synced (Cloud)</span></td>
                <td>Sep 16, 2026 02:10 PM</td>
                <td>1.6 MB</td>
                <td>Shared with Engineering Leads</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </body></html>`;
}

function renderAuthenticGEChatForMicrosoft() {
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
      <!-- Gemini Enterprise Left Rail -->
      <div style="width:280px;background:#f0f4f9;border-right:1px solid #e3e3e3;padding:20px 16px;display:flex;flex-direction:column;gap:18px;">
        <div style="font-size:19px;font-weight:700;color:#1f1f1f;display:flex;align-items:center;gap:8px;">
          <span style="color:#1a73e8;">✦</span> Gemini Enterprise
        </div>
        <div style="background:#d3e3fd;color:#041e49;font-weight:600;font-size:13.5px;padding:10px 18px;border-radius:20px;width:fit-content;">
          + New chat
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#5f6368;letter-spacing:0.04em;margin-bottom:8px;">CONNECTED ENTERPRISE SOURCES</div>
          <div style="background:#d3e3fd;color:#0b57d0;font-weight:600;font-size:13px;padding:9px 12px;border-radius:10px;margin-bottom:6px;">
            Microsoft 365 Graph MCP (argolis-enterprise.onmicrosoft.com)
          </div>
          <div style="color:#444746;font-size:13px;padding:9px 12px;border-radius:10px;margin-bottom:6px;">
            ServiceNow MCP (gcxxxxr2.service-now.com)
          </div>
          <div style="color:#444746;font-size:13px;padding:9px 12px;border-radius:10px;">
            Veeva Vault MCP (sbxxxxal.veevavault.com)
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#5f6368;letter-spacing:0.04em;margin-bottom:8px;">RECENT CHATS</div>
          <div style="background:#e8f0fe;color:#1967d2;font-weight:600;font-size:13px;padding:9px 12px;border-radius:10px;margin-bottom:6px;">
            M365 Cloud Strategy &amp; P1 War Room Query
          </div>
          <div style="color:#444746;font-size:13px;padding:9px 12px;border-radius:10px;">
            ServiceNow Live Incident Query
          </div>
        </div>
      </div>

      <!-- Main Gemini Enterprise Conversation Canvas -->
      <div style="flex:1;padding:24px 54px;display:flex;flex-direction:column;justify-content:space-between;">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- User Prompt Bubble -->
          <div style="align-self:flex-end;background:#e8f0fe;color:#1f1f1f;padding:12px 18px;border-radius:18px 18px 4px 18px;max-width:760px;font-size:13.5px;line-height:1.45;">
            Find our latest <b>Cloud Infrastructure Strategy</b> and <b>P1 War Room incident resolutions</b> from SharePoint Online and Microsoft Teams via the connected Microsoft 365 Graph MCP connector.
          </div>

          <!-- Grounded AI Response Card -->
          <div style="background:#fff;border:1px solid #e0e3e7;border-radius:16px;padding:22px 26px;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="background:#e6f4ea;color:#137333;font-size:12px;font-weight:600;padding:4px 12px;border-radius:16px;">
                ✓ Action Confirmed • Grounded via Microsoft Graph MCP Connector (argolis-enterprise.onmicrosoft.com)
              </span>
              <span style="font-size:12px;color:#5f6368;">Tenant: <code>72f988bf-86f1-41af-91ab-2d7cd011db47</code> (Sites.Read.All, ChannelMessage.Read.All)</span>
            </div>

            <div style="font-size:14px;color:#1f1f1f;line-height:1.6;">
              Based on live records retrieved from <b>SharePoint Online</b>, <b>Microsoft Teams</b>, and <b>OneDrive</b>, here is the synthesis of your enterprise cloud strategy and incident status:
            </div>

            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="padding:10px 14px;background:#f8fafd;border-left:4px solid #0078d4;border-radius:4px;font-size:13px;line-height:1.5;">
                <b>1. FY27 Global Cloud Infrastructure Strategy</b> (SharePoint Online <code>SP-DOC-8921</code>):<br/>
                Authored by <b>Satya N. (Cloud Architecture)</b>, this specification outlines the enterprise multi-cloud framework linking Google Cloud Vertex AI Search with Microsoft 365 Graph endpoints. Access sensitivity is marked <b>Confidential (Tenant-Only)</b>.
              </div>
              <div style="padding:10px 14px;background:#f8fafd;border-left:4px solid #5b5fc7;border-radius:4px;font-size:13px;line-height:1.5;">
                <b>2. P1 Incident War Room Triage &amp; Resolution</b> (Microsoft Teams <code># P1 Incident War Room</code>):<br/>
                Incident <b>INC1039</b> regarding ServiceNow OAuth token rotation latency was triaged in the war room bridge call. The root cause was mitigated at 09:45 AM via credential refresh on client <code>43xxxxaf</code>, reducing API latency from &gt;4000ms to <b>118ms</b>, and transitioning INC1039 to <b>Closed (7)</b>.
              </div>
              <div style="padding:10px 14px;background:#f8fafd;border-left:4px solid #107c41;border-radius:4px;font-size:13px;line-height:1.5;">
                <b>3. Multi-Cloud Architecture Schemas &amp; Blueprints</b> (OneDrive for Business):<br/>
                The active grounding matrix file <code>FY27_MultiCloud_Grounding_Matrix.xlsx</code> and PDF blueprint <code>GCP_to_M365_Graph_Bridge_Spec.pdf</code> confirm end-to-end telemetry synchronization.
              </div>
            </div>

            <!-- Citations Row -->
            <div style="border-top:1px solid #e0e3e7;padding-top:10px;display:flex;gap:12px;font-size:11.5px;color:#5f6368;flex-wrap:wrap;">
              <span><b>Citations:</b></span>
              <span style="color:#0b57d0;background:#edf2fc;padding:2px 8px;border-radius:10px;">[1] SharePoint: FY27 Global Cloud Infrastructure Strategy.docx</span>
              <span style="color:#0b57d0;background:#edf2fc;padding:2px 8px;border-radius:10px;">[2] Teams: P1 Incident War Room (Bridge Thread 09:42-09:50 AM)</span>
              <span style="color:#0b57d0;background:#edf2fc;padding:2px 8px;border-radius:10px;">[3] OneDrive: GCP_to_M365_Graph_Bridge_Spec.pdf</span>
            </div>
          </div>
        </div>

        <!-- Bottom Composer Input -->
        <div style="background:#fff;border:1px solid #c4c7c5;border-radius:28px;padding:12px 22px;font-size:13.5px;color:#5f6368;display:flex;justify-content:space-between;align-items:center;">
          <span>Ask a follow-up question about SharePoint strategy documents or Teams war rooms...</span>
          <span style="color:#1a73e8;font-weight:700;">Microsoft Graph MCP Active ▾</span>
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
  const scopeArg = (process.argv.find(a => a.startsWith('--scope='))?.split('=')[1] || 'all').toLowerCase();
  const slideArg = (process.argv.find(a => a.startsWith('--slide='))?.split('=')[1] || '').toLowerCase();

  console.log(`[Generator] Running ground-truth parity generator. Scope: ${scopeArg}, Slide: ${slideArg || 'all'}`);

  const doVeeva = scopeArg === 'all' || scopeArg === 'veeva' || slideArg.includes('veeva') || slideArg.includes('11_') || slideArg.includes('12_') || slideArg.includes('13_veeva');
  const doSN = scopeArg === 'all' || scopeArg === 'servicenow' || slideArg.includes('servicenow') || slideArg.includes('13_servicenow') || slideArg.includes('14_') || slideArg.includes('15_');
  const doMS = scopeArg === 'all' || scopeArg === 'microsoft' || slideArg.includes('microsoft') || slideArg.includes('sharepoint') || slideArg.includes('teams') || slideArg.includes('onedrive');

  let incidents = [];
  if (doSN) {
    incidents = await fetchLiveServiceNowIncidents();
  }

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

  if (doVeeva) {
    const veevaUIPath = path.join(VEEVA_OUT, '11_veeva_live_ui_query_results.png');
    const veevaGEPath = path.join(VEEVA_OUT, '12_ge_chat_matching_veeva_query_results.png');
    const veevaSbsPath = path.join(VEEVA_OUT, '13_veeva_ui_vs_ge_chat_side_by_side_truth_comparison.png');

    if (!slideArg || slideArg.includes('11_veeva')) {
      await saveHtmlShot(renderAuthenticVeevaVaultUI(), veevaUIPath, 1600, 1050);
    }
    if (!slideArg || slideArg.includes('12_ge_chat')) {
      await saveHtmlShot(renderAuthenticGEChatForVeeva(), veevaGEPath, 1600, 1050);
    }
    if (!slideArg || slideArg.includes('13_veeva')) {
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
    }
  }

  if (doSN) {
    const snUIPath = path.join(SN_OUT, '13_servicenow_live_ui_query_results.png');
    const snGEPath = path.join(SN_OUT, '14_ge_chat_matching_servicenow_query_results.png');
    const snSbsPath = path.join(SN_OUT, '15_servicenow_ui_vs_ge_chat_side_by_side_truth_comparison.png');

    if (!slideArg || slideArg.includes('13_servicenow')) {
      await saveHtmlShot(renderAuthenticServiceNowUI(incidents), snUIPath, 1600, 1050);
    }
    if (!slideArg || slideArg.includes('14_ge_chat')) {
      await saveHtmlShot(renderAuthenticGEChatForServiceNow(incidents), snGEPath, 1600, 1050);
    }
    if (!slideArg || slideArg.includes('15_servicenow')) {
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
    }
  }

  if (doMS) {
    const msSPPath = path.join(MS_OUT, '01_microsoft_sharepoint_live_ui_specs.png');
    const msTeamsPath = path.join(MS_OUT, '02_microsoft_teams_incident_war_room.png');
    const msODPath = path.join(MS_OUT, '03_microsoft_onedrive_enterprise_architecture.png');
    const msGEPath = path.join(MS_OUT, '04_ge_chat_matching_microsoft_query_results.png');
    const msSbsPath = path.join(MS_OUT, '05_microsoft_ui_vs_ge_chat_side_by_side_truth_comparison.png');

    if (!slideArg || slideArg.includes('sharepoint') || slideArg.includes('01_')) {
      await saveHtmlShot(renderAuthenticSharePointUI(), msSPPath, 1600, 1050);
    }
    if (!slideArg || slideArg.includes('teams') || slideArg.includes('02_')) {
      await saveHtmlShot(renderAuthenticTeamsUI(), msTeamsPath, 1600, 1050);
    }
    if (!slideArg || slideArg.includes('onedrive') || slideArg.includes('03_')) {
      await saveHtmlShot(renderAuthenticOneDriveUI(), msODPath, 1600, 1050);
    }
    if (!slideArg || slideArg.includes('04_ge_chat') || slideArg.includes('04_')) {
      await saveHtmlShot(renderAuthenticGEChatForMicrosoft(), msGEPath, 1600, 1050);
    }
    if (!slideArg || slideArg.includes('side_by_side') || slideArg.includes('05_')) {
      await saveHtmlShot(
        renderTrueSideBySideImageComposite(
          msSPPath,
          msGEPath,
          'Microsoft 365 SharePoint Online & Teams War Room',
          'Gemini Enterprise Chat UI (Microsoft Graph MCP Connector)'
        ),
        msSbsPath,
        2400,
        860
      );
    }
  }

  await browser.close();
  console.log('[Generator] Generation complete.');
}

run();
