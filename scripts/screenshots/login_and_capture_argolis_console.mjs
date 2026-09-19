import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';

const OUT_DIR = './screenshots/screenshots_argolis_console';
fs.mkdirSync(OUT_DIR, { recursive: true });

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function waitForPort(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      return await httpGetJson(`http://127.0.0.1:${port}/json/list`);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Timed out waiting for headless Chrome on port ${port}`);
}

async function cdpSend(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = Math.floor(Math.random() * 100000);
    ws.onopen = () => ws.send(JSON.stringify({ id, method, params }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.close();
        resolve(msg.result);
      }
    };
    ws.onerror = reject;
  });
}

async function realMouseClick(ws, x, y) {
  await cdpSend(ws, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: Math.round(x),
    y: Math.round(y),
    button: 'left',
    clickCount: 1
  });
  await cdpSend(ws, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: Math.round(x),
    y: Math.round(y),
    button: 'left',
    clickCount: 1
  });
}

async function clickVisibleNextButton(ws) {
  const res = await cdpSend(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const btn = [...document.querySelectorAll('button, input[type="submit"], div[role="button"]')].find(b => {
        const txt = (b.innerText || b.value || '').trim();
        const r = b.getBoundingClientRect();
        return /^next$/i.test(txt) && r.width > 20 && r.height > 15;
      });
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (btn.innerText || btn.value || '').trim() };
    })()`
  });
  const pt = res?.result?.value;
  if (pt) {
    console.log('Clicking visible Next button at:', pt);
    await realMouseClick(ws, pt.x, pt.y);
  } else {
    console.log('Visible Next button not found');
  }
}

console.log('Launching Google-signed Chrome on macOS in pure --headless=new background mode for Argolis...');
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--user-data-dir=/tmp/chrome_argolis_session',
    '--remote-debugging-port=9223',
    '--window-size=1600,1000',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ],
  { stdio: 'ignore' }
);

try {
  const targets = await waitForPort(9223);
  const pageTarget = targets.find((t) => t.type === 'page');
  const ws = pageTarget.webSocketDebuggerUrl;

  await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 2,
    mobile: false
  });

  console.log('Step 1: Navigating to Google Sign-In for admin@nixxxxga.altostrat.com ...');
  await cdpSend(ws, 'Page.navigate', {
    url: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fconsole.cloud.google.com%2Fgen-app-builder%2Fengines%3Fproject%3Dnixxxx-2'
  });
  await new Promise((r) => setTimeout(r, 4000));

  // Find visible email input, click it, type email, and click visible Next button
  const emailBox = await cdpSend(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const inp = [...document.querySelectorAll('input')].find(i => {
        const r = i.getBoundingClientRect();
        return r.width > 40 && r.height > 15 && i.name !== 'hiddenPassword';
      });
      if (!inp) return null;
      inp.value = '';
      inp.focus();
      const r = inp.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: inp.id, name: inp.name };
    })()`
  });
  const ePt = emailBox?.result?.value;
  console.log('Visible Email input:', ePt);
  if (ePt) {
    await realMouseClick(ws, ePt.x, ePt.y);
    await new Promise((r) => setTimeout(r, 250));
    await cdpSend(ws, 'Input.insertText', { text: 'admin@nixxxxga.altostrat.com' });
    await new Promise((r) => setTimeout(r, 500));
    await clickVisibleNextButton(ws);
  }
  await new Promise((r) => setTimeout(r, 6000));

  // Find visible password input (width > 40 && name !== 'hiddenPassword')
  const passBox = await cdpSend(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const inp = [...document.querySelectorAll('input[type="password"]')].find(i => {
        const r = i.getBoundingClientRect();
        return r.width > 40 && r.height > 15 && i.name !== 'hiddenPassword';
      });
      if (!inp) return { found: false, url: location.href, text: document.body.innerText.slice(0, 350).replace(/\\s+/g, ' ') };
      inp.value = '';
      inp.focus();
      const r = inp.getBoundingClientRect();
      return { found: true, x: r.left + r.width / 2, y: r.top + r.height / 2, id: inp.id, name: inp.name };
    })()`
  });
  const pPt = passBox?.result?.value;
  console.log('Visible Password input:', JSON.stringify(pPt));
  if (pPt?.found) {
    await realMouseClick(ws, pPt.x, pPt.y);
    await new Promise((r) => setTimeout(r, 250));
    await cdpSend(ws, 'Input.insertText', { text: 'Omxxxx66' });
    await new Promise((r) => setTimeout(r, 500));
    await clickVisibleNextButton(ws);
  }
  await new Promise((r) => setTimeout(r, 14000));

  const postState = await cdpSend(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: '({ title: document.title, url: location.href, snippet: document.body.innerText.slice(0, 400).replace(/\\s+/g, " ") })'
  });
  console.log('Post-password state:', JSON.stringify(postState?.result?.value));

  const sPost = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT_DIR}/00_post_login_state.png`, Buffer.from(sPost.data, 'base64'));

  const pagesToCapture = [
    {
      name: '01_argolis_console_engines_overview',
      url: 'https://console.cloud.google.com/gen-app-builder/engines?project=nixxxx-2',
      wait: 12000
    },
    {
      name: '02_argolis_console_datastores_overview',
      url: 'https://console.cloud.google.com/gen-app-builder/data-stores?project=nixxxx-2',
      wait: 10000
    },
    {
      name: '03_argolis_console_create_datastore_connectors',
      url: 'https://console.cloud.google.com/gen-app-builder/data-stores/create?project=nixxxx-2',
      wait: 10000
    }
  ];

  for (const p of pagesToCapture) {
    console.log(`Navigating to ${p.url} ...`);
    await cdpSend(ws, 'Page.navigate', { url: p.url });
    await new Promise((r) => setTimeout(r, p.wait));
    const shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
    const outPath = `${OUT_DIR}/${p.name}.png`;
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    const state = await cdpSend(ws, 'Runtime.evaluate', {
      returnByValue: true,
      expression: '({ title: document.title, url: location.href, snippet: document.body.innerText.slice(0, 350).replace(/\\s+/g, " ") })'
    });
    console.log(`Saved ${outPath} ->`, JSON.stringify(state?.result?.value));
  }
} finally {
  chrome.kill('SIGTERM');
  console.log('Headless Argolis Chrome cleanly terminated.');
}
