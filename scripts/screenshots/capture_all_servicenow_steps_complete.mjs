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
    await sleep(350);
  }
  async typeInto(x, y, text) {
    await this.realClick(x, y);
    await sleep(150);
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      modifiers: 4
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
  async pressEnter() {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    });
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

async function runArgolisFlows() {
  console.log('=== PART 1: Argolis Wizard Credentials + Connection Test + BYOMCP Re-auth + Argolis GE Web App ===');
  const { proc, cdp } = await launchHeadlessChrome('/tmp/chrome_argolis_session', 9351);
  try {
    // 1. Navigate to Create Data Store
    await cdp.send('Page.navigate', {
      url: 'https://console.cloud.google.com/gen-app-builder/data-stores/create?project=nixxxx-2'
    });
    await sleep(11000);

    // Type "ServiceNow" into the "Search by tool name, Agent Registry ID, type, producer, or use case" input
    const searchInputPos = await cdp.eval(`(() => {
      const inputs = [...document.querySelectorAll('input')];
      for (const el of inputs) {
        const r = el.getBoundingClientRect();
        if (r.width > 200 && r.height > 20 && r.top > 200 && r.top < 360) {
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      return null;
    })()`);
    console.log('searchInputPos:', searchInputPos);
    if (searchInputPos) {
      await cdp.typeInto(searchInputPos.x, searchInputPos.y, 'ServiceNow');
      await sleep(2500);
    }

    // Now find "Add data source" on the filtered ServiceNow card
    const addServiceNowPos = await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('button, a')];
      for (const b of btns) {
        const t = (b.innerText || '').trim();
        if (t === 'Add data source') {
          const r = b.getBoundingClientRect();
          if (r.width > 20 && r.height > 15 && r.top > 250) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
      }
      return null;
    })()`);
    console.log('addServiceNowPos after search:', addServiceNowPos);
    if (addServiceNowPos) {
      await cdp.realClick(addServiceNowPos.x, addServiceNowPos.y);
      await sleep(7000);
    }

    // Now we are on "Specify the ServiceNow source for your data store"
    // Click inner "Continue" button inside section "1 Connector mode"
    const step1ContinuePos = await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('button')];
      for (const b of btns) {
        const t = (b.innerText || '').trim();
        if (t === 'Continue') {
          const r = b.getBoundingClientRect();
          if (r.width > 10 && r.height > 10 && r.top > 150) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top };
          }
        }
      }
      return null;
    })()`);
    console.log('step1ContinuePos:', step1ContinuePos);
    if (step1ContinuePos) {
      await cdp.realClick(step1ContinuePos.x, step1ContinuePos.y);
      await sleep(4000);
    }

    // Enumerate all visible inputs in "2 Authentication settings"
    const authInputs = await cdp.eval(`(() => {
      const inputs = [...document.querySelectorAll('input, textarea')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 30 && r.height > 12 && r.top > 120;
      });
      return inputs.map((el, idx) => {
        const r = el.getBoundingClientRect();
        const container = el.closest('mat-form-field, .mat-mdc-form-field, label, div');
        const parentText = el.parentElement?.parentElement?.parentElement?.innerText || '';
        const label = (container ? container.innerText : parentText).replace(/\\s+/g, ' ').trim().slice(0, 140);
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
    console.log('Discovered authInputs inside Step 2:', JSON.stringify(authInputs, null, 2));

    // Match and fill each credential input; if labels are generic, also map by order
    const orderedCreds = [
      SN_CREDS.instanceUri,
      SN_CREDS.clientId,
      SN_CREDS.clientSecret,
      SN_CREDS.username,
      SN_CREDS.password
    ];
    let filledCount = 0;
    for (let i = 0; i < (authInputs || []).length; i++) {
      const inp = authInputs[i];
      const l = `${inp.label} ${inp.placeholder} ${inp.ariaLabel} ${inp.name}`.toLowerCase();
      if (l.includes('search for resources')) continue;
      let val = null;
      if (l.includes('instance') || l.includes('url') || l.includes('host') || l.includes('domain') || l.includes('site')) {
        val = SN_CREDS.instanceUri;
      } else if (l.includes('client id')) {
        val = SN_CREDS.clientId;
      } else if (l.includes('secret')) {
        val = SN_CREDS.clientSecret;
      } else if (l.includes('user')) {
        val = SN_CREDS.username;
      } else if (l.includes('password')) {
        val = SN_CREDS.password;
      } else if (filledCount < orderedCreds.length) {
        val = orderedCreds[filledCount];
      }
      if (val) {
        filledCount++;
        console.log(`Typing into input #${i} (${inp.label || inp.ariaLabel}) at (${inp.x}, ${inp.y})`);
        await cdp.typeInto(inp.x, inp.y, val);
      }
    }

    await sleep(1200);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '09_argolis_wizard_step2_servicenow_credentials_filled.png'));

    // Click Continue / Test connection inside 2 Authentication settings
    const step2Btns = await cdp.eval(`(() => {
      return [...document.querySelectorAll('button')].map(b => {
        const r = b.getBoundingClientRect();
        return { text: (b.innerText || '').trim(), x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, w: r.width, h: r.height, disabled: b.disabled };
      }).filter(b => b.w > 15 && b.h > 10 && b.top > 150);
    })()`);
    console.log('step2Btns:', JSON.stringify(step2Btns, null, 2));
    const continueBtn = (step2Btns || []).find(b => b.text === 'Continue' && !b.disabled) || (step2Btns || []).find(b => b.text === 'Continue');
    if (continueBtn) {
      console.log('Clicking Continue inside 2 Authentication settings to validate connection:', continueBtn);
      await cdp.realClick(continueBtn.x, continueBtn.y);
      await sleep(8000);
    }

    await cdp.screenshot(path.join(ARGOLIS_DIR, '10_argolis_wizard_step3_servicenow_connection_tested_destinations.png'));

    // Scroll down to capture steps 3, 4, 5
    await cdp.eval(`(() => {
      const scrollers = [...document.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 80);
      for (const s of scrollers) s.scrollTop = s.scrollHeight;
    })()`);
    await sleep(2000);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '11_argolis_wizard_step5_servicenow_entities_to_search.png'));

    // 2. Capture Re-authenticate modal on active BYOMCP ServiceNow connector
    await cdp.send('Page.navigate', {
      url: 'https://console.cloud.google.com/gen-app-builder/locations/us/collections/servicenow-mcp-cloudrun-gxp_17xxxx92/connector?project=nixxxx-2'
    });
    await sleep(9000);
    const reAuthBtn = await cdp.eval(`(() => {
      const btns = [...document.querySelectorAll('button, a')];
      const b = btns.find(el => (el.innerText || '').includes('Re-authenticate'));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    console.log('reAuthBtn:', reAuthBtn);
    if (reAuthBtn) {
      await cdp.realClick(reAuthBtn.x, reAuthBtn.y);
      await sleep(3000);
      await cdp.screenshot(path.join(ARGOLIS_DIR, '13_argolis_byomcp_reauthenticate_credentials_modal.png'));
    }

    // 3. Navigate to Argolis Gemini Enterprise Web App (linked directly to servicenow-mcp-cloudrun-gxp!)
    await cdp.send('Page.navigate', {
      url: 'https://vertexaisearch.cloud.google.com/us/home/cid/e8xxxxc6?hl=en_US'
    });
    await sleep(11000);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '14_argolis_ge_chat_home_screen.png'));

    // Find prompt input on Argolis GE Web App (traverse shadow roots too!)
    const argolisChatPos = await cdp.eval(`(() => {
      function findInputs(root) {
        const out = [];
        for (const el of root.querySelectorAll('*')) {
          const tag = el.tagName?.toLowerCase() || '';
          const role = el.getAttribute?.('role') || '';
          const ce = el.getAttribute?.('contenteditable') || '';
          const ph = el.getAttribute?.('placeholder') || el.getAttribute?.('aria-label') || '';
          if (tag === 'textarea' || ce === 'true' || role === 'textbox' || ph.toLowerCase().includes('ask')) {
            const r = el.getBoundingClientRect();
            if (r.width > 120 && r.height > 18) {
              out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, tag, ph, w: r.width, h: r.height });
            }
          }
          if (el.shadowRoot) out.push(...findInputs(el.shadowRoot));
        }
        return out;
      }
      return findInputs(document);
    })()`);
    console.log('argolisChatPos candidates:', JSON.stringify(argolisChatPos, null, 2));

    const targetBox = (argolisChatPos && argolisChatPos[0]) || { x: 750, y: 490 };
    const snQuery = 'Query our connected ServiceNow instance (https://gcxxxxr2.service-now.com) for open incidents, summarize their incident numbers, priority, short description, and current status.';
    await cdp.realClick(targetBox.x, targetBox.y);
    await sleep(400);
    await cdp.send('Input.insertText', { text: snQuery });
    await sleep(1000);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '15_argolis_ge_chat_servicenow_query_entered.png'));

    await cdp.pressEnter();
    console.log('Waiting 20s for Argolis GE Chat ServiceNow response stream...');
    await sleep(20000);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '16_argolis_ge_chat_servicenow_live_response.png'));
  } finally {
    cdp.close();
    try { proc.kill('SIGKILL'); } catch {}
  }
}

async function runCorpGeChatFlow() {
  console.log('=== PART 2: Live Gemini Enterprise App (ucs-widget.corp.google.com) ServiceNow Query ===');
  const { proc, cdp } = await launchHeadlessChrome('/tmp/chrome_ge_session', 9352);
  try {
    await cdp.send('Page.navigate', {
      url: 'https://ucs-widget.corp.google.com/home/cid/fdd1e98d-1f52-4407-98fd-80e27c61fbc9?e=SparkDogfoodLaunch%3A%3ALaunch&pli=1'
    });
    await sleep(10000);

    // Traverse shadow DOM to find exact "Ask Gemini Enterprise" input box
    const corpChatPos = await cdp.eval(`(() => {
      function findInputs(root) {
        const out = [];
        for (const el of root.querySelectorAll('*')) {
          const tag = el.tagName?.toLowerCase() || '';
          const role = el.getAttribute?.('role') || '';
          const ce = el.getAttribute?.('contenteditable') || '';
          const ph = el.getAttribute?.('placeholder') || el.getAttribute?.('aria-label') || '';
          if (tag === 'textarea' || ce === 'true' || role === 'textbox' || ph.toLowerCase().includes('ask')) {
            const r = el.getBoundingClientRect();
            if (r.width > 120 && r.height > 18) {
              out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, tag, ph, w: r.width, h: r.height });
            }
          }
          if (el.shadowRoot) out.push(...findInputs(el.shadowRoot));
        }
        return out;
      }
      return findInputs(document);
    })()`);
    console.log('corpChatPos candidates:', JSON.stringify(corpChatPos, null, 2));

    const box = (corpChatPos && corpChatPos[0]) || { x: 680, y: 475 };
    const snQuery = 'Search ServiceNow incidents and change requests from our ServiceNow connector (https://gcxxxxr2.service-now.com) and provide an executive summary table of P1/P2 incidents, owners, and resolution status.';
    await cdp.realClick(box.x, box.y);
    await sleep(400);
    await cdp.send('Input.insertText', { text: snQuery });
    await sleep(1000);
    await cdp.screenshot(path.join(GE_DIR, 'ge_app_08_servicenow_query_prompt_entered.png'));

    await cdp.pressEnter();
    console.log('Waiting 20s for Corp GE Chat response stream...');
    await sleep(20000);
    await cdp.screenshot(path.join(GE_DIR, 'ge_app_09_servicenow_live_chat_response_part1.png'));

    await cdp.eval(`(() => {
      function scrollAll(root) {
        for (const el of root.querySelectorAll('*')) {
          if (el.scrollHeight > el.clientHeight + 80) el.scrollTop = el.scrollHeight;
          if (el.shadowRoot) scrollAll(el.shadowRoot);
        }
      }
      scrollAll(document);
    })()`);
    await sleep(2000);
    await cdp.screenshot(path.join(GE_DIR, 'ge_app_10_servicenow_live_chat_response_part2.png'));
  } finally {
    cdp.close();
    try { proc.kill('SIGKILL'); } catch {}
  }
}

await runArgolisFlows();
await runCorpGeChatFlow();
console.log('COMPLETE');
