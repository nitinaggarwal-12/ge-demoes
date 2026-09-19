import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARGOLIS_DIR = './screenshots/screenshots_argolis_console';
fs.mkdirSync(ARGOLIS_DIR, { recursive: true });

const SN_CREDS = {
  instanceUri: 'https://gcxxxxr2.service-now.com',
  clientId: '43xxxxaf',
  clientSecret: 'bExxxxQK',
  authUri: 'https://gcxxxxr2.service-now.com/oauth_auth.do',
  tokenUri: 'https://gcxxxxr2.service-now.com/oauth_token.do'
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

const { proc, cdp } = await launchHeadlessChrome('/tmp/chrome_argolis_session', 9361);
try {
  // === 1. Fill ALL 5 ServiceNow OAuth2 Credential Inputs + Click Verify Auth + Continue ===
  await cdp.send('Page.navigate', {
    url: 'https://console.cloud.google.com/gen-app-builder/data-stores/create?project=nixxxx-2'
  });
  await sleep(11000);

  // Search "ServiceNow"
  await cdp.typeInto(991, 294, 'ServiceNow');
  await sleep(2500);

  // Click "Add data source" on ServiceNow card
  await cdp.realClick(622, 598);
  await sleep(6500);

  // Click inner "Continue" inside "1 Connector mode"
  await cdp.realClick(663, 498);
  await sleep(4000);

  // Find ALL visible inputs inside "2 Authentication settings" sorted strictly by vertical Y position
  const sortedInputs = await cdp.eval(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 100 && r.height > 15 && r.top > 250 && r.top < 700;
    });
    return inputs.map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, type: el.type };
    }).sort((a, b) => a.top - b.top);
  })()`);
  console.log('Sorted inputs inside 2 Authentication settings:', JSON.stringify(sortedInputs, null, 2));

  const valuesInExactOrder = [
    SN_CREDS.instanceUri,
    SN_CREDS.clientId,
    SN_CREDS.clientSecret,
    SN_CREDS.authUri,
    SN_CREDS.tokenUri
  ];

  for (let i = 0; i < Math.min(sortedInputs.length, valuesInExactOrder.length); i++) {
    console.log(`Typing into input #${i} at y=${sortedInputs[i].y}: ${valuesInExactOrder[i]}`);
    await cdp.typeInto(sortedInputs[i].x, sortedInputs[i].y, valuesInExactOrder[i]);
  }
  await sleep(1200);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '09_argolis_wizard_step2_servicenow_credentials_filled.png'));

  // Click "Verify Auth" button and capture verification state
  const verifyAuthPos = await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find(el => (el.innerText || '').trim() === 'Verify Auth');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: b.disabled };
  })()`);
  console.log('verifyAuthPos:', verifyAuthPos);
  if (verifyAuthPos) {
    await cdp.realClick(verifyAuthPos.x, verifyAuthPos.y);
    await sleep(3500);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '09b_argolis_wizard_step2_servicenow_verify_auth_clicked.png'));
  }

  // Click inner "Continue" button inside 2 Authentication settings
  const continueStep2Pos = await cdp.eval(`(() => {
    const btns = [...document.querySelectorAll('button')].filter(el => (el.innerText || '').trim() === 'Continue');
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.top > 600 && r.top < 850) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top };
      }
    }
    return null;
  })()`);
  console.log('continueStep2Pos:', continueStep2Pos);
  if (continueStep2Pos) {
    await cdp.realClick(continueStep2Pos.x, continueStep2Pos.y);
    await sleep(5000);
    await cdp.screenshot(path.join(ARGOLIS_DIR, '10_argolis_wizard_step3_servicenow_connection_tested_destinations.png'));
  }

  // Also click accordion headers for "3 Destinations", "4 Advanced options", "5 Entities to search"
  for (const [label, file] of [
    ['Destinations', '10b_argolis_wizard_step3_destinations_expanded.png'],
    ['Advanced options', '10c_argolis_wizard_step4_advanced_options_expanded.png'],
    ['Entities to search', '11_argolis_wizard_step5_servicenow_entities_to_search.png']
  ]) {
    const pos = await cdp.eval(`(() => {
      const els = [...document.querySelectorAll('*')].filter(el => (el.innerText || '').trim() === '${label}');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 20 && r.height > 10 && r.top > 150) {
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
      return null;
    })()`);
    console.log(`Header [${label}] pos:`, pos);
    if (pos) {
      await cdp.realClick(pos.x, pos.y);
      await sleep(2500);
      await cdp.screenshot(path.join(ARGOLIS_DIR, file));
    }
  }

  // === 2. Fill Re-authenticate Modal on Active BYOMCP ServiceNow Connector ===
  await cdp.send('Page.navigate', {
    url: 'https://console.cloud.google.com/gen-app-builder/locations/us/collections/servicenow-mcp-cloudrun-gxp_17xxxx92/connector?project=nixxxx-2'
  });
  await sleep(9000);
  await cdp.realClick(883, 142); // Re-authenticate button
  await sleep(3000);

  const modalInputs = await cdp.eval(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.left > 950 && r.width > 100 && r.height > 15;
    });
    return inputs.map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, value: el.value };
    }).sort((a, b) => a.top - b.top);
  })()`);
  console.log('Re-authenticate modal inputs:', JSON.stringify(modalInputs, null, 2));
  // modalInputs[0] is MCP Server URL (already filled), fill Authorization URL, Parameters, Token URL, Client ID, Client Secret, Scopes
  if (modalInputs.length >= 5) {
    await cdp.typeInto(modalInputs[1].x, modalInputs[1].y, SN_CREDS.authUri);
    await cdp.typeInto(modalInputs[3].x, modalInputs[3].y, SN_CREDS.tokenUri);
    await cdp.typeInto(modalInputs[4].x, modalInputs[4].y, SN_CREDS.clientId);
    if (modalInputs[5]) await cdp.typeInto(modalInputs[5].x, modalInputs[5].y, SN_CREDS.clientSecret);
  }
  await sleep(1200);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '13b_argolis_byomcp_reauthenticate_credentials_populated.png'));

  // === 3. Argolis Gemini Enterprise Web App (Dismiss Welcome Modal + Capture Live ServiceNow Conversations & New Query) ===
  await cdp.send('Page.navigate', {
    url: 'https://vertexaisearch.cloud.google.com/us/home/cid/e8xxxxc6?hl=en_US'
  });
  await sleep(10000);

  // Click "Get started" on the Welcome to Gemini Enterprise! modal (x: 627, y: 724)
  await cdp.realClick(627, 724);
  await sleep(2500);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '14_argolis_ge_chat_home_screen.png'));

  // Click the existing "ServiceNow incident retrieval" thread in the left sidebar (x: 80, y: 348)
  const snThreadPos = await cdp.eval(`(() => {
    function findByText(root, txt) {
      for (const el of root.querySelectorAll('*')) {
        if ((el.innerText || '').trim() === txt) {
          const r = el.getBoundingClientRect();
          if (r.width > 20 && r.height > 10) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        if (el.shadowRoot) {
          const res = findByText(el.shadowRoot, txt);
          if (res) return res;
        }
      }
      return null;
    }
    return findByText(document, 'ServiceNow incident retrieval');
  })()`);
  console.log('snThreadPos:', snThreadPos);
  await cdp.realClick(snThreadPos ? snThreadPos.x : 80, snThreadPos ? snThreadPos.y : 348);
  await sleep(6000);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '15_argolis_ge_chat_servicenow_incident_retrieval_thread.png'));

  // Click the existing "Query GxP LIMS asset CI" thread in the left sidebar (x: 80, y: 376)
  const gxpThreadPos = await cdp.eval(`(() => {
    function findByText(root, txt) {
      for (const el of root.querySelectorAll('*')) {
        if ((el.innerText || '').trim() === txt) {
          const r = el.getBoundingClientRect();
          if (r.width > 20 && r.height > 10) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        if (el.shadowRoot) {
          const res = findByText(el.shadowRoot, txt);
          if (res) return res;
        }
      }
      return null;
    }
    return findByText(document, 'Query GxP LIMS asset CI');
  })()`);
  console.log('gxpThreadPos:', gxpThreadPos);
  await cdp.realClick(gxpThreadPos ? gxpThreadPos.x : 80, gxpThreadPos ? gxpThreadPos.y : 376);
  await sleep(6000);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '16_argolis_ge_chat_gxp_lims_asset_ci_thread.png'));

  // Click "New chat" (x: 80, y: 74), enter a brand-new live ServiceNow query, and submit
  await cdp.realClick(80, 74);
  await sleep(3000);
  await cdp.realClick(750, 442);
  await sleep(400);
  const liveQuery = 'Query ServiceNow incidents and configuration items from our connected ServiceNow MCP server and list open high-priority tickets with status and assignment group.';
  await cdp.send('Input.insertText', { text: liveQuery });
  await sleep(1000);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '17_argolis_ge_chat_new_servicenow_query_entered.png'));

  await cdp.pressEnter();
  console.log('Waiting 22s for Argolis GE Chat live ServiceNow MCP response...');
  await sleep(22000);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '18_argolis_ge_chat_new_servicenow_query_live_response.png'));
} finally {
  cdp.close();
  try { proc.kill('SIGKILL'); } catch {}
}
console.log('FINAL PRECISION PASS COMPLETE');
