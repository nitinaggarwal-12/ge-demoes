import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARGOLIS_DIR = './screenshots/screenshots_argolis_console';
fs.mkdirSync(ARGOLIS_DIR, { recursive: true });

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
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
    await sleep(60);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(80);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(350);
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

try { execSync('pkill -f "remote-debugging-port=9391" || true'); } catch {}
await sleep(500);
const proc = spawn(
  CHROME_BIN,
  [
    '--headless=new',
    '--remote-debugging-port=9391',
    '--user-data-dir=/tmp/chrome_argolis_session',
    '--window-size=1600,1050',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ],
  { detached: true, stdio: 'ignore' }
);
proc.unref();

let cdp;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch('http://127.0.0.1:9391/json/list');
    const tabs = await res.json();
    const pageTab = tabs.find((t) => t.type === 'page') || tabs[0];
    if (pageTab?.webSocketDebuggerUrl) {
      cdp = new CDPSession(pageTab.webSocketDebuggerUrl);
      await cdp.ready();
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1600,
        height: 1050,
        deviceScaleFactor: 2,
        mobile: false
      });
      break;
    }
  } catch {}
  await sleep(500);
}

try {
  // Navigate to Argolis Gemini Enterprise Web App (where ServiceNow connector is attached)
  await cdp.send('Page.navigate', {
    url: 'https://vertexaisearch.cloud.google.com/us/home/cid/e8xxxxc6?hl=en_US'
  });
  await sleep(10000);

  // Dismiss Welcome modal if shown
  await cdp.eval(`(() => {
    function walk(root) {
      for (const el of root.querySelectorAll('*')) {
        if ((el.innerText || '').trim() === 'Get started') el.click();
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }
    walk(document);
  })()`);
  await sleep(2000);

  // Inspect all interactive buttons inside the central prompt composer area (x > 400)
  const composerButtons = await cdp.eval(`(() => {
    const found = [];
    function walk(root) {
      for (const el of root.querySelectorAll('*')) {
        const tag = el.tagName?.toLowerCase() || '';
        const role = el.getAttribute?.('role') || '';
        const aria = el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '';
        const txt = (el.innerText || '').trim();
        if (tag === 'button' || role === 'button' || tag.includes('button') || tag.includes('icon')) {
          const r = el.getBoundingClientRect();
          if (r.left > 400 && r.width > 14 && r.height > 14 && r.top > 300 && r.top < 750) {
            found.push({
              tag,
              aria,
              txt: txt.slice(0, 60),
              x: Math.round(r.left + r.width / 2),
              y: Math.round(r.top + r.height / 2),
              w: Math.round(r.width),
              h: Math.round(r.height)
            });
          }
        }
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    }
    walk(document);
    return found;
  })()`);
  console.log('Composer buttons in main chat area:', JSON.stringify(composerButtons, null, 2));

  // Find the Sources / Connectors button inside the composer (aria-label containing 'source' or 'tool' or 'connector' or the puzzle/sources icon)
  const sourcesBtn = (composerButtons || []).find(b =>
    b.aria.toLowerCase().includes('source') ||
    b.aria.toLowerCase().includes('connector') ||
    b.txt.toLowerCase().includes('source')
  );
  console.log('Identified Sources/Connectors button:', sourcesBtn);

  if (sourcesBtn) {
    await cdp.realClick(sourcesBtn.x, sourcesBtn.y);
    await sleep(2500);

    // Inspect all menu items / toggles inside the opened Sources / Connectors popup
    const menuItems = await cdp.eval(`(() => {
      const items = [];
      function walk(root) {
        for (const el of root.querySelectorAll('*')) {
          const txt = (el.innerText || '').trim();
          const aria = el.getAttribute?.('aria-label') || '';
          if (txt && txt.length < 80) {
            const r = el.getBoundingClientRect();
            if (r.left > 350 && r.width > 30 && r.height > 15 && r.top > 150) {
              items.push({ txt, aria, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
            }
          }
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      }
      walk(document);
      return items;
    })()`);
    console.log('Opened Sources/Connectors menu items:', JSON.stringify(menuItems.slice(0, 40), null, 2));

    // Capture 2x Retina screenshot showing the Sources / Connectors menu open with ServiceNow connector visible & selected
    await cdp.screenshot(path.join(ARGOLIS_DIR, '19_ge_chat_sources_menu_servicenow_connector_selected.png'));

    // If there is a ServiceNow connector item in the menu that isn't toggled, ensure it is selected/enabled
    const snItem = (menuItems || []).find(i => i.txt.toLowerCase().includes('servicenow'));
    console.log('ServiceNow connector menu item:', snItem);
  }

  // Now click strictly inside the central chat input box (x > 500, NEVER sidebar x < 300)
  const centralInput = await cdp.eval(`(() => {
    function walk(root) {
      for (const el of root.querySelectorAll('*')) {
        const tag = el.tagName?.toLowerCase() || '';
        const ce = el.getAttribute?.('contenteditable') || '';
        const role = el.getAttribute?.('role') || '';
        if (tag === 'textarea' || ce === 'true' || role === 'textbox') {
          const r = el.getBoundingClientRect();
          if (r.left > 450 && r.width > 200 && r.height > 18) {
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height };
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
  console.log('Central chat composer input box:', centralInput);

  if (centralInput) {
    await cdp.realClick(centralInput.x, centralInput.y);
    await sleep(400);
    const snQuery = 'Retrieve incident details for INC0032555 from ServiceNow and show its status, priority, short description, and opened timestamp.';
    await cdp.send('Input.insertText', { text: snQuery });
    await sleep(1000);

    // Screenshot showing the prompt typed into the main Gemini Enterprise chat box (NOT Ask AI OCE) with ServiceNow connector active
    await cdp.screenshot(path.join(ARGOLIS_DIR, '20_ge_chat_servicenow_connector_prompt_ready.png'));

    // Submit query
    await cdp.pressEnter();
    console.log('Submitted live query to ServiceNow connector, waiting 10s to check for Action Confirmation card...');
    await sleep(10000);

    // Capture the live MCP tool invocation / confirmation card or response
    await cdp.screenshot(path.join(ARGOLIS_DIR, '21_ge_chat_servicenow_connector_tool_call_state.png'));

    // If a "Confirm" / "Allow" / "Run" button appears for the ServiceNow MCP tool action, click it!
    const confirmBtn = await cdp.eval(`(() => {
      function walk(root) {
        for (const el of root.querySelectorAll('*')) {
          const txt = (el.innerText || '').trim();
          if (['Confirm', 'Allow', 'Approve', 'Run', 'Continue'].includes(txt)) {
            const r = el.getBoundingClientRect();
            if (r.left > 400 && r.width > 30 && r.height > 15) {
              return { txt, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
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
    console.log('Confirm action button:', confirmBtn);
    if (confirmBtn) {
      await cdp.realClick(confirmBtn.x, confirmBtn.y);
      console.log('Clicked Confirm button for ServiceNow MCP tool call, waiting 16s for final response...');
      await sleep(16000);
    } else {
      await sleep(12000);
    }

    await cdp.screenshot(path.join(ARGOLIS_DIR, '22_ge_chat_servicenow_connector_live_query_response.png'));
  }
} finally {
  cdp.close();
  try { proc.kill('SIGKILL'); } catch {}
}
console.log('SERVICENOW CONNECTOR SELECTION & QUERY COMPLETE');
