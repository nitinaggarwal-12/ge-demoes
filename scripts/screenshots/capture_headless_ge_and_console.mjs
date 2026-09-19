import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';

const OUT_DIR = './screenshots/screenshots_ge_app_and_console';
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

console.log('Launching Google-signed Chrome on macOS in pure --headless=new background mode...');
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--user-data-dir=/tmp/chrome_ge_session',
    '--remote-debugging-port=9224',
    '--window-size=1600,1000',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ],
  { stdio: 'ignore' }
);

try {
  const targetsList = await waitForPort(9224);
  const pageTarget = targetsList.find((t) => t.type === 'page');
  const ws = pageTarget.webSocketDebuggerUrl;

  await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 2,
    mobile: false
  });

  const shots = [
    {
      name: 'gcp_console_03_ai_applications_start_page',
      url: 'https://pantheon.corp.google.com/gen-app-builder/start?project=nixxxx-2',
      wait: 9000
    },
    {
      name: 'gcp_console_04_ai_applications_engines',
      url: 'https://pantheon.corp.google.com/gen-app-builder/engines?project=nixxxx-2',
      wait: 8000
    },
    {
      name: 'gcp_console_05_ai_applications_datastores',
      url: 'https://pantheon.corp.google.com/gen-app-builder/data-stores?project=nixxxx-2',
      wait: 8000
    },
    {
      name: 'ge_app_07_headless_verified_home',
      url: 'https://ucs-widget.corp.google.com/home/cid/fdd1e98d-1f52-4407-98fd-80e27c61fbc9?e=SparkDogfoodLaunch%3A%3ALaunch&pli=1',
      wait: 7000
    }
  ];

  for (const s of shots) {
    console.log(`Navigating headless Chrome to ${s.url} ...`);
    await cdpSend(ws, 'Page.navigate', { url: s.url });
    await new Promise((r) => setTimeout(r, s.wait));
    const png = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
    const outPath = `${OUT_DIR}/${s.name}.png`;
    fs.writeFileSync(outPath, Buffer.from(png.data, 'base64'));
    const info = await cdpSend(ws, 'Runtime.evaluate', {
      expression: 'document.title + " ||| " + location.href'
    });
    console.log(`Saved ${outPath} -> ${info?.result?.value}`);
  }
} finally {
  chrome.kill('SIGTERM');
  console.log('Headless Chrome cleanly terminated.');
}
