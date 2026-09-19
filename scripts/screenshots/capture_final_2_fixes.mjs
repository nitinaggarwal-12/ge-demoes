import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARGOLIS_DIR = './screenshots/screenshots_argolis_console';

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
    await sleep(300);
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

const { proc, cdp } = await launchHeadlessChrome('/tmp/chrome_argolis_session', 9371);
try {
  // === FIX 1: Fill all 5 exact coordinate boxes inside 2 Authentication settings ===
  await cdp.send('Page.navigate', {
    url: 'https://console.cloud.google.com/gen-app-builder/data-stores/create?project=nixxxx-2'
  });
  await sleep(11000);
  await cdp.typeInto(991, 294, 'ServiceNow');
  await sleep(2500);
  await cdp.realClick(622, 598);
  await sleep(6500);
  await cdp.realClick(663, 498);
  await sleep(4000);

  // Fill exact coordinates verified from 10b_argolis_wizard_step3_destinations_expanded.png:
  // Instance URL *: (547, 340)
  // Client ID *:    (547, 413)
  // Client Secret *:(547, 495)
  // Auth URI *:     (547, 571)
  // Token URI *:    (547, 646)
  await cdp.typeInto(547, 340, SN_CREDS.instanceUri);
  await cdp.typeInto(547, 413, SN_CREDS.clientId);
  await cdp.typeInto(547, 495, SN_CREDS.clientSecret);
  await cdp.typeInto(547, 571, SN_CREDS.authUri);
  await cdp.typeInto(547, 646, SN_CREDS.tokenUri);
  await sleep(1200);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '09_argolis_wizard_step2_servicenow_credentials_filled.png'));

  // === FIX 2: Dismiss Shadow DOM Welcome dialog & open ServiceNow threads + submit new query in Argolis GE Web App ===
  await cdp.send('Page.navigate', {
    url: 'https://vertexaisearch.cloud.google.com/us/home/cid/e8xxxxc6?hl=en_US'
  });
  await sleep(10000);

  const dismissRes = await cdp.eval(`(() => {
    const clicked = [];
    function walk(root) {
      for (const el of root.querySelectorAll('*')) {
        const txt = (el.innerText || '').trim();
        if (txt === 'Get started' && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.children.length === 0)) {
          el.click();
          clicked.push(el.tagName);
        }
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }
    walk(document);
    return clicked;
  })()`);
  console.log('Dismissed Get started buttons:', dismissRes);
  await sleep(2500);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '14_argolis_ge_chat_home_screen.png'));

  // Click "ServiceNow incident retrieval" thread via Shadow DOM walk
  const openSnThread = await cdp.eval(`(() => {
    function walk(root) {
      for (const el of root.querySelectorAll('*')) {
        if ((el.innerText || '').trim() === 'ServiceNow incident retrieval' && el.children.length === 0) {
          el.click();
          return true;
        }
        if (el.shadowRoot && walk(el.shadowRoot)) return true;
      }
      return false;
    }
    return walk(document);
  })()`);
  console.log('Opened ServiceNow incident retrieval thread:', openSnThread);
  await sleep(6000);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '15_argolis_ge_chat_servicenow_incident_retrieval_thread.png'));

  // Click "Query GxP LIMS asset CI" thread via Shadow DOM walk
  const openGxpThread = await cdp.eval(`(() => {
    function walk(root) {
      for (const el of root.querySelectorAll('*')) {
        if ((el.innerText || '').trim() === 'Query GxP LIMS asset CI' && el.children.length === 0) {
          el.click();
          return true;
        }
        if (el.shadowRoot && walk(el.shadowRoot)) return true;
      }
      return false;
    }
    return walk(document);
  })()`);
  console.log('Opened Query GxP LIMS asset CI thread:', openGxpThread);
  await sleep(6000);
  await cdp.screenshot(path.join(ARGOLIS_DIR, '16_argolis_ge_chat_gxp_lims_asset_ci_thread.png'));

  // Click "New chat" via Shadow DOM walk, then enter new live ServiceNow query and submit
  await cdp.eval(`(() => {
    function walk(root) {
      for (const el of root.querySelectorAll('*')) {
        if ((el.innerText || '').trim() === 'New chat' && el.children.length === 0) {
          el.click();
          return true;
        }
        if (el.shadowRoot && walk(el.shadowRoot)) return true;
      }
      return false;
    }
    return walk(document);
  })()`);
  await sleep(3000);

  // Focus the prompt input box inside Shadow DOM and type live ServiceNow query
  const promptPos = await cdp.eval(`(() => {
    function walk(root) {
      for (const el of root.querySelectorAll('*')) {
        const tag = el.tagName?.toLowerCase() || '';
        const ce = el.getAttribute?.('contenteditable') || '';
        const role = el.getAttribute?.('role') || '';
        if (tag === 'textarea' || ce === 'true' || role === 'textbox') {
          const r = el.getBoundingClientRect();
          if (r.width > 150 && r.height > 15) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
        if (el.shadowRoot) {
          const res = walk(el.shadowRoot);
          if (res) return res;
        }
      }
      return null;
    }
    return walk(document);
  })()`);
  console.log('Argolis GE promptPos after dismiss:', promptPos);
  const clickPt = promptPos || { x: 944, y: 442 };
  await cdp.realClick(clickPt.x, clickPt.y);
  await sleep(400);
  const liveQuery = 'Query ServiceNow incidents from our connected ServiceNow MCP server (https://gcxxxxr2.service-now.com) and summarize all open P1/P2 incidents, priority, state, and assigned group.';
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
console.log('FINAL 2 FIXES COMPLETE');
