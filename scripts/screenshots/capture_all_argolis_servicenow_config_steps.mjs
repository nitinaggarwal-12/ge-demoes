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

console.log('Launching Google-signed Chrome on macOS in pure --headless=new background mode for Argolis real-click steps...');
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

  // STEP 4: Create Data Store -> Click "Show all" next to "Third-party data sources"
  console.log('Step 4: Navigating to Create Data Store -> Clicking "Show all" on Third-party data sources...');
  await cdpSend(ws, 'Page.navigate', {
    url: 'https://console.cloud.google.com/gen-app-builder/data-stores/create?project=nixxxx-2'
  });
  await new Promise((r) => setTimeout(r, 9000));

  const showAllBtns = await cdpSend(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      return [...document.querySelectorAll('button, a')].filter(b => /show all/i.test(b.innerText || '')).map(b => {
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (b.innerText || '').trim(), top: r.top };
      });
    })()`
  });
  console.log('Show all buttons:', JSON.stringify(showAllBtns?.result?.value));
  const thirdPartyShowAll = showAllBtns?.result?.value?.find((b) => b.top > 500) || showAllBtns?.result?.value?.[1];
  if (thirdPartyShowAll) {
    await realMouseClick(ws, thirdPartyShowAll.x, thirdPartyShowAll.y);
    await new Promise((r) => setTimeout(r, 3000));
  }

  let shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT_DIR}/04_argolis_wizard_step1_search_servicenow_cards.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved 04_argolis_wizard_step1_search_servicenow_cards.png');

  // Scroll or locate ServiceNow card in Third-party data sources list and click its "Add data source"
  const snCardBtn = await cdpSend(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const cards = [...document.querySelectorAll('mat-card, [class*="card"], div')].filter(c => {
        const t = (c.innerText || '');
        return /servicenow/i.test(t) && /add data source/i.test(t) && c.getBoundingClientRect().height < 400;
      });
      for (const c of cards) {
        const btn = [...c.querySelectorAll('button, a')].find(b => /add data source/i.test(b.innerText || ''));
        if (btn) {
          btn.scrollIntoView({ block: 'center' });
          const r = btn.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, card: (c.innerText || '').replace(/\\s+/g, ' ').slice(0, 120) };
        }
      }
      return { notFound: true, allCards: [...document.querySelectorAll('button, a')].filter(b => /add data source/i.test(b.innerText || '')).map(b => (b.parentElement?.parentElement?.innerText || '').replace(/\\s+/g, ' ').slice(0, 80)) };
    })()`
  });
  console.log('ServiceNow Add data source button:', JSON.stringify(snCardBtn?.result?.value));

  await new Promise((r) => setTimeout(r, 1000));
  shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT_DIR}/04b_argolis_wizard_step1_servicenow_card_scrolled.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved 04b_argolis_wizard_step1_servicenow_card_scrolled.png');

  if (snCardBtn?.result?.value?.x) {
    // Re-read rect after scrollIntoView
    const snBtnRect = await cdpSend(ws, 'Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const cards = [...document.querySelectorAll('mat-card, [class*="card"], div')].filter(c => /servicenow/i.test(c.innerText || '') && /add data source/i.test(c.innerText || '') && c.getBoundingClientRect().height < 400);
        const btn = [...(cards[0]?.querySelectorAll('button, a') || [])].find(b => /add data source/i.test(b.innerText || ''));
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`
    });
    if (snBtnRect?.result?.value) {
      console.log('Clicking ServiceNow Add data source at:', snBtnRect.result.value);
      await realMouseClick(ws, snBtnRect.result.value.x, snBtnRect.result.value.y);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT_DIR}/05_argolis_wizard_step2_servicenow_mode_and_auth_config.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved 05_argolis_wizard_step2_servicenow_mode_and_auth_config.png');

  // Scroll down inside Step 2 ServiceNow form to capture lower fields (Client ID, Secret, Entities, etc.)
  await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 250) {
          el.scrollTop = 650;
        }
      }
      window.scrollBy(0, 650);
    })()`
  });
  await new Promise((r) => setTimeout(r, 1500));
  shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT_DIR}/06_argolis_wizard_step2_servicenow_auth_fields_scrolled.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved 06_argolis_wizard_step2_servicenow_auth_fields_scrolled.png');

  // STEP 7: Go to Data Stores table and CLICK the real hyperlink "servicenow-mcp-cloudrun-gxp"
  console.log('Step 7: Opening Data Stores table and clicking real link "servicenow-mcp-cloudrun-gxp"...');
  await cdpSend(ws, 'Page.navigate', {
    url: 'https://console.cloud.google.com/gen-app-builder/data-stores?project=nixxxx-2'
  });
  await new Promise((r) => setTimeout(r, 9000));
  const dsLink = await cdpSend(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const a = [...document.querySelectorAll('a')].find(el => (el.innerText || '').includes('servicenow-mcp-cloudrun-gxp'));
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, href: a.href };
    })()`
  });
  console.log('Found servicenow-mcp-cloudrun-gxp link:', dsLink?.result?.value);
  if (dsLink?.result?.value) {
    await realMouseClick(ws, dsLink.result.value.x, dsLink.result.value.y);
    await new Promise((r) => setTimeout(r, 7000));
  }
  shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT_DIR}/07_argolis_existing_byomcp_datastore_detail_config.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved 07_argolis_existing_byomcp_datastore_detail_config.png');

  // STEP 8: Go to Apps table and CLICK the real hyperlink "gemini-enterprise-17xxxx46"
  console.log('Step 8: Opening Apps table and clicking real link "gemini-enterprise-17xxxx46"...');
  await cdpSend(ws, 'Page.navigate', {
    url: 'https://console.cloud.google.com/gen-app-builder/engines?project=nixxxx-2'
  });
  await new Promise((r) => setTimeout(r, 9000));
  const appLink = await cdpSend(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const a = [...document.querySelectorAll('a')].find(el => (el.innerText || '').includes('gemini-enterprise-17xxxx46'));
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, href: a.href };
    })()`
  });
  console.log('Found gemini-enterprise-17xxxx46 link:', appLink?.result?.value);
  if (appLink?.result?.value) {
    await realMouseClick(ws, appLink.result.value.x, appLink.result.value.y);
    await new Promise((r) => setTimeout(r, 7000));
  }
  shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT_DIR}/08_argolis_gemini_enterprise_app_config_and_connected_datastores.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved 08_argolis_gemini_enterprise_app_config_and_connected_datastores.png');
} finally {
  chrome.kill('SIGTERM');
  console.log('Headless Argolis Chrome cleanly terminated.');
}
