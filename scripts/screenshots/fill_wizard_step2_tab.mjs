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
    await sleep(300);
  }
  async pressTab() {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await sleep(200);
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

try { execSync('pkill -f "remote-debugging-port=9381" || true'); } catch {}
await sleep(500);
const proc = spawn(
  CHROME_BIN,
  [
    '--headless=new',
    '--remote-debugging-port=9381',
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
    const res = await fetch('http://127.0.0.1:9381/json/list');
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
  await cdp.send('Page.navigate', {
    url: 'https://console.cloud.google.com/gen-app-builder/data-stores/create?project=nixxxx-2'
  });
  await sleep(11000);
  await cdp.realClick(991, 294);
  await cdp.send('Input.insertText', { text: 'ServiceNow' });
  await sleep(2500);
  await cdp.realClick(622, 598);
  await sleep(6500);
  await cdp.realClick(663, 498);
  await sleep(4000);

  // Focus first field (Instance URL * at x: 876, y: 339), insert text, then Tab through each subsequent field
  await cdp.realClick(876, 339);
  await sleep(200);
  await cdp.send('Input.insertText', { text: SN_CREDS.instanceUri });
  await sleep(250);

  await cdp.pressTab();
  await cdp.send('Input.insertText', { text: SN_CREDS.clientId });
  await sleep(250);

  await cdp.pressTab();
  await cdp.send('Input.insertText', { text: SN_CREDS.clientSecret });
  await sleep(250);

  // One more Tab may land on the password visibility toggle eye button, check activeElement tagName
  const tagAfterSecret = await cdp.send('Runtime.evaluate', {
    expression: 'document.activeElement?.tagName',
    returnByValue: true
  });
  await cdp.pressTab();
  const tagNow = await cdp.send('Runtime.evaluate', {
    expression: 'document.activeElement?.tagName',
    returnByValue: true
  });
  if (tagNow?.result?.value === 'BUTTON') {
    await cdp.pressTab();
  }
  await cdp.send('Input.insertText', { text: SN_CREDS.authUri });
  await sleep(250);

  await cdp.pressTab();
  await cdp.send('Input.insertText', { text: SN_CREDS.tokenUri });
  await sleep(600);

  await cdp.screenshot(path.join(ARGOLIS_DIR, '09_argolis_wizard_step2_servicenow_credentials_filled.png'));
} finally {
  cdp.close();
  try { proc.kill('SIGKILL'); } catch {}
}
