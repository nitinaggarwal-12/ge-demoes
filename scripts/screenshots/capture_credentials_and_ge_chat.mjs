import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARGOLIS_DIR = './screenshots/screenshots_argolis_console';
const GE_DIR = './screenshots/screenshots_ge_app_and_console';
fs.mkdirSync(ARGOLIS_DIR, { recursive: true });
fs.mkdirSync(GE_DIR, { recursive: true });

const SN_CREDS = {
  instanceUri: 'https://gcxxxxr2.service-now.com',
  clientId: '43xxxxaf',
  clientSecret: 'bExxxxQK',
  username: 'connectorsuserqa@dexxxxte.com',
  password: 'Dexxxx25'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDPSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res?.result?.value;
  }
  async screenshot(outPath) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 1050,
      deviceScaleFactor: 2,
      mobile: false
    });
    await sleep(600);
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
    console.log(`[SAVED] ${outPath} (${fs.statSync(outPath).size} bytes)`);
  }
  async realClick(x, y) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'left'
    });
    await sleep(60);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
    await sleep(80);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
    await sleep(300);
  }
  async typeInto(x, y, text) {
    await this.realClick(x, y);
    await sleep(150);
    // Select all and clear first
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      modifiers: 4 // Meta/Command on macOS
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      modifiers: 4
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Backspace',
      code: 'Backspace'
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace'
    });
    await sleep(100);
    await this.send('Input.insertText', { text });
    await sleep(250);
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function launchHeadlessChrome(userDataDir, port) {
  try {
    execSync(`pkill -f "remote-debugging-port=${port}" || true`);
  } catch {}
  await sleep(600);
  const proc = spawn(
    CHROME_BIN,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1600,1050',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ],
    { detached: true, stdio: 'ignore' }
  );
  proc.unref();
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const tabs = await res.json();
      const pageTab = tabs.find((t) => t.type === 'page') || tabs[0];
      if (pageTab?.webSocketDebuggerUrl) {
        const cdp = new CDPSession(pageTab.webSocketDebuggerUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: 1600,
          height: 1050,
          deviceScaleFactor: 2,
          mobile: false
        });
        return { proc, cdp };
      }
    } catch {}
    await sleep(500);
  }
  throw new Error(`Failed to connect to headless Chrome on port ${port}`);
}

async function runArgolisCredentialAndConnectionFlow() {
  console.log('=== PART 1: Argolis ServiceNow Credentials & Connection Test ===');
  const { proc, cdp } = await launchHeadlessChrome('/tmp/chrome_argolis_session', 9341);
  try {
    // Navigate directly to Create Data Store
    await cdp.send('Page.navigate', {
      url: 'https://console.cloud.google.com/gen-app-builder/data-stores/create?project=nixxxx-2'
    });
    await sleep(11000);

    // Click "Show all" on Third-party sources if present
    const showAllPos = await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('button, a')];
      const b = btns.find(el => (el.innerText || '').trim() === 'Show all');
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (showAllPos) {
      await cdp.realClick(showAllPos.x, showAllPos.y);
      await sleep(2500);
    }

    // Find ServiceNow card's "Add data source" button and click it
    const addServiceNowPos = await cdp.eval(`(() => {
      const cards = [...document.querySelectorAll('mat-card, .cfc-card, div')];
      for (const el of cards) {
        const txt = (el.innerText || '').trim();
        if (txt.includes('ServiceNow') && txt.includes('Import data from your ServiceNow site')) {
          const btn = [...el.querySelectorAll('button, a')].find(b => (b.innerText || '').includes('Add data source'));
          if (btn) {
            btn.scrollIntoView({ block: 'center' });
            const r = btn.getBoundingClientRect();
            if (r.width > 10 && r.height > 10) {
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
          }
        }
      }
      return null;
    })()`);
    console.log('addServiceNowPos:', addServiceNowPos);
    if (addServiceNowPos) {
      await cdp.realClick(addServiceNowPos.x, addServiceNowPos.y);
      await sleep(6000);
    }

    // Now we are on "Specify the ServiceNow source for your data store"
    // Step 1: Click inner "Continue" button inside section "1 Connector mode"
    const step1ContinuePos = await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('button')];
      for (const b of btns) {
        const t = (b.innerText || '').trim();
        if (t === 'Continue') {
          const r = b.getBoundingClientRect();
          if (r.width > 10 && r.height > 10 && r.top > 150 && r.top < 750) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: t };
          }
        }
      }
      return null;
    })()`);
    console.log('step1ContinuePos:', step1ContinuePos);
    if (step1ContinuePos) {
      await cdp.realClick(step1ContinuePos.x, step1ContinuePos.y);
      await sleep(3500);
    }

    // Inspect all inputs now visible in "2 Authentication settings"
    const authInputs = await cdp.eval(`(() => {
      const inputs = [...document.querySelectorAll('input, textarea')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 20 && r.height > 10 && r.top > 80;
      });
      return inputs.map((el, idx) => {
        const r = el.getBoundingClientRect();
        const field = el.closest('mat-form-field, .mat-mdc-form-field, div');
        const label = field ? (field.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 120) : '';
        return {
          idx,
          type: el.type,
          name: el.name,
          placeholder: el.placeholder,
          ariaLabel: el.getAttribute('aria-label') || '',
          label,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          top: r.top
        };
      });
    })()`);
    console.log('Discovered authInputs:', JSON.stringify(authInputs, null, 2));

    // Fill each input based on its label / position
    for (const inp of authInputs || []) {
      const l = `${inp.label} ${inp.placeholder} ${inp.ariaLabel} ${inp.name}`.toLowerCase();
      if (l.includes('filter') || l.includes('search products')) continue;
      let val = null;
      if (l.includes('instance') || l.includes('url') || l.includes('host') || l.includes('domain')) {
        val = SN_CREDS.instanceUri;
      } else if (l.includes('client id')) {
        val = SN_CREDS.clientId;
      } else if (l.includes('client secret') || l.includes('secret')) {
        val = SN_CREDS.clientSecret;
      } else if (l.includes('user') || l.includes('account')) {
        val = SN_CREDS.username;
      } else if (l.includes('password')) {
        val = SN_CREDS.password;
      }
      if (val) {
        console.log(`Filling [${inp.label || inp.ariaLabel}] at (${inp.x}, ${inp.y}) with ${val.slice(0, 18)}...`);
        await cdp.typeInto(inp.x, inp.y, val);
      }
    }

    // If any inputs were unlabeled or ordered by index inside 2 Authentication settings, verify values
    await sleep(1000);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '09_argolis_wizard_step2_servicenow_credentials_filled.png'));

    // Click Continue / Test connection inside 2 Authentication settings
    const step2ContinuePos = await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const candidates = [];
      for (const b of btns) {
        const t = (b.innerText || '').trim();
        if (t === 'Continue' || t.toLowerCase().includes('test') || t.toLowerCase().includes('validate') || t.toLowerCase().includes('save')) {
          const r = b.getBoundingClientRect();
          if (r.width > 10 && r.height > 10 && r.top > 150) {
            candidates.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, text: t, top: r.top });
          }
        }
      }
      return candidates;
    })()`);
    console.log('step2ContinuePos candidates:', step2ContinuePos);
    if (step2ContinuePos && step2ContinuePos.length > 0) {
      // Click the visible Continue button inside the expanded section
      const targetBtn = step2ContinuePos[0];
      await cdp.realClick(targetBtn.x, targetBtn.y);
      await sleep(7000);
    }

    await cdp.screenshot(path.join(ARGOLIS_DIR, '10_argolis_wizard_step3_servicenow_connection_tested_destinations.png'));

    // Scroll down to capture steps 3, 4, 5 ("3 Destinations", "4 Advanced options", "5 Entities to search")
    await cdp.eval(`(() => {
      const headers = [...document.querySelectorAll('*')].filter(el => (el.innerText || '').includes('5 Entities to search') || (el.innerText || '').includes('3 Destinations'));
      if (headers.length > 0) headers[headers.length - 1].scrollIntoView({ block: 'center' });
    })()`);
    await sleep(2000);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '11_argolis_wizard_step5_servicenow_entities_to_search.png'));

    // Also navigate to the live connected BYOMCP ServiceNow connector detail page and open "View/edit parameters"
    await cdp.send('Page.navigate', {
      url: 'https://console.cloud.google.com/gen-app-builder/locations/us/collections/servicenow-mcp-cloudrun-gxp_17xxxx92/connector?project=nixxxx-2'
    });
    await sleep(9000);
    const viewParamsBtn = await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('button, a')];
      const b = btns.find(el => (el.innerText || '').includes('View/edit parameters'));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    console.log('viewParamsBtn:', viewParamsBtn);
    if (viewParamsBtn) {
      await cdp.realClick(viewParamsBtn.x, viewParamsBtn.y);
      await sleep(3000);
      await cdp.screenshot(path.join(ARGOLIS_DIR, '12_argolis_byomcp_view_edit_parameters_modal.png'));
    }

    // Check Preview / Web App link inside the Argolis Gemini Enterprise App
    await cdp.send('Page.navigate', {
      url: 'https://console.cloud.google.com/gemini-enterprise/locations/us/engines/gemini-enterprise-17845238_17xxxx46/overview?project=nixxxx-2'
    });
    await sleep(9000);
    const engineLinks = await cdp.eval(`(() => {
      return [...document.querySelectorAll('a, button')].map(el => ({
        text: (el.innerText || '').trim().slice(0, 80),
        href: el.href || ''
      })).filter(x => x.text || x.href);
    })()`);
    console.log('Argolis Engine links sample:', JSON.stringify((engineLinks || []).slice(0, 30), null, 2));
  } finally {
    cdp.close();
    try { proc.kill('SIGKILL'); } catch {}
  }
}

async function runGeminiEnterpriseLiveChatQueries() {
  console.log('=== PART 2: Live Gemini Enterprise Chat (GE Chat) ServiceNow Queries ===');
  const { proc, cdp } = await launchHeadlessChrome('/tmp/chrome_ge_session', 9342);
  try {
    await cdp.send('Page.navigate', {
      url: 'https://ucs-widget.corp.google.com/home/cid/fdd1e98d-1f52-4407-98fd-80e27c61fbc9?e=SparkDogfoodLaunch%3A%3ALaunch&pli=1'
    });
    await sleep(9000);

    // Dismiss any welcome dialog if present
    await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const closeBtn = btns.find(b => (b.innerText || '').includes('Got it') || (b.innerText || '').includes('Continue') || (b.innerText || '').includes('Close'));
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(1000);

    // Find the main chat prompt box ("Ask Gemini Enterprise")
    const promptBox = await cdp.eval(`(() => {
      const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"], rich-textarea, .ql-editor')];
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (r.width > 150 && r.height > 20) {
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName, w: r.width, h: r.height };
        }
      }
      // Fallback: search by placeholder text
      const all = [...document.querySelectorAll('*')];
      for (const el of all) {
        const txt = (el.innerText || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim();
        if (txt.includes('Ask Gemini Enterprise')) {
          const r = el.getBoundingClientRect();
          if (r.width > 100 && r.height > 15) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName, w: r.width, h: r.height };
          }
        }
      }
      return null;
    })()`);
    console.log('GE Chat promptBox:', promptBox);

    if (promptBox) {
      const query1 = 'Query ServiceNow incidents from instance https://gcxxxxr2.service-now.com and summarize active high-priority P1/P2 tickets, assigned groups, and SLA status in a structured table.';
      await cdp.realClick(promptBox.x, promptBox.y);
      await sleep(300);
      await cdp.send('Input.insertText', { text: query1 });
      await sleep(800);
      // Capture screenshot showing the live ServiceNow prompt typed into GE Chat before/at submission
      await cdp.screenshot(path.join(GE_DIR, 'ge_app_08_servicenow_query_prompt_entered.png'));

      // Press Enter to submit
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13
      });

      // Wait for Gemini Enterprise to stream the full response
      console.log('Waiting 18s for live GE Chat response stream...');
      await sleep(18000);
      await cdp.screenshot(path.join(GE_DIR, 'ge_app_09_servicenow_live_chat_response_part1.png'));

      // Scroll down inside the chat conversation container to capture full response table/details
      await cdp.eval(`(() => {
        const scrollers = [...document.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 80);
        for (const s of scrollers) {
          s.scrollTop = s.scrollHeight;
        }
      })()`);
      await sleep(2000);
      await cdp.screenshot(path.join(GE_DIR, 'ge_app_10_servicenow_live_chat_response_part2.png'));
    }
  } finally {
    cdp.close();
    try { proc.kill('SIGKILL'); } catch {}
  }
}

await runArgolisCredentialAndConnectionFlow();
await runGeminiEnterpriseLiveChatQueries();
console.log('ALL DONE');
