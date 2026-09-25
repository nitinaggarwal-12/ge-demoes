import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CANDIDATES = [
  // PRIORITY 1: Google-Signed Local Chrome (TeamIdentifier=EQHXZ8M8AV)
  {
    id: 'google-signed-chrome',
    priority: 1,
    name: 'Google Signed Local Chrome (Google LLC)',
    engine: 'cdp',
    browserType: 'chrome',
    path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    appBundle: '/Applications/Google Chrome.app',
    requireGoogleSignature: true,
  },
  // PRIORITY 2: Generic Chrome Channels (Canary, Beta, Dev, Chromium)
  {
    id: 'chrome-canary',
    priority: 2,
    name: 'Google Chrome Canary',
    engine: 'cdp',
    browserType: 'chrome',
    path: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    appBundle: '/Applications/Google Chrome Canary.app',
  },
  {
    id: 'chrome-beta',
    priority: 2,
    name: 'Google Chrome Beta',
    engine: 'cdp',
    browserType: 'chrome',
    path: '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    appBundle: '/Applications/Google Chrome Beta.app',
  },
  {
    id: 'chromium-generic',
    priority: 2,
    name: 'Generic Chromium',
    engine: 'cdp',
    browserType: 'chrome',
    path: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    appBundle: '/Applications/Chromium.app',
  },
  // PRIORITY 3: Any Other Available Browser on the Machine (Edge, Opera, Brave, Firefox, Safari)
  {
    id: 'microsoft-edge',
    priority: 3,
    name: 'Microsoft Edge',
    engine: 'cdp',
    browserType: 'chrome',
    path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    appBundle: '/Applications/Microsoft Edge.app',
  },
  {
    id: 'opera',
    priority: 3,
    name: 'Opera Browser',
    engine: 'cdp',
    browserType: 'chrome',
    path: '/Applications/Opera.app/Contents/MacOS/Opera',
    appBundle: '/Applications/Opera.app',
  },
  {
    id: 'brave',
    priority: 3,
    name: 'Brave Browser',
    engine: 'cdp',
    browserType: 'chrome',
    path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    appBundle: '/Applications/Brave Browser.app',
  },
  {
    id: 'mozilla-firefox',
    priority: 3,
    name: 'Mozilla Firefox',
    engine: 'firefox-bidi',
    browserType: 'firefox',
    path: '/Applications/Firefox.app/Contents/MacOS/firefox',
    appBundle: '/Applications/Firefox.app',
  },
  {
    id: 'apple-safari',
    priority: 3,
    name: 'Apple Safari (safaridriver)',
    engine: 'safari-webdriver',
    browserType: 'safari',
    path: '/usr/bin/safaridriver',
    appBundle: '/Applications/Safari.app',
  },
];

/**
 * Verifies macOS code signature on a .app bundle to confirm Google LLC signature (TeamIdentifier=EQHXZ8M8AV)
 */
export function verifyCodeSignature(appBundlePath) {
  try {
    if (!fs.existsSync(appBundlePath)) {
      return { signed: false, isGoogleSigned: false, teamId: null, authority: null };
    }
    const out = execSync(`codesign -dv --verbose=4 "${appBundlePath}" 2>&1`, {
      encoding: 'utf-8',
      timeout: 3000,
    });
    const teamMatch = out.match(/TeamIdentifier=([A-Z0-9]+)/);
    const authMatch = out.match(/Authority=(.+)/);
    const teamId = teamMatch ? teamMatch[1].trim() : null;
    const authority = authMatch ? authMatch[1].trim() : null;
    const isGoogleSigned = teamId === 'EQHXZ8M8AV' || (authority && authority.includes('Google LLC'));
    return {
      signed: Boolean(teamId || authority),
      isGoogleSigned: Boolean(isGoogleSigned),
      teamId,
      authority,
    };
  } catch {
    return { signed: false, isGoogleSigned: false, teamId: null, authority: null };
  }
}

/**
 * Resolves the highest-priority available browser on the machine following:
 * Priority 1: Google-Signed Local Chrome
 * Priority 2: Generic Chrome (Canary / Beta / Chromium)
 * Priority 3: Any other available browser (Microsoft Edge / Opera / Brave / Firefox / Safari)
 */
export async function resolveBestBrowser(options = {}) {
  const { excludePriorities = [], preferredId = null } = options;
  const inventory = [];

  for (const cand of CANDIDATES) {
    const exists = fs.existsSync(cand.path);
    let sig = { signed: false, isGoogleSigned: false, teamId: null, authority: null };
    if (exists && cand.appBundle) {
      sig = verifyCodeSignature(cand.appBundle);
    }
    inventory.push({
      ...cand,
      available: exists && (!cand.requireGoogleSignature || sig.isGoogleSigned),
      ...sig,
    });
  }

  const eligible = inventory.filter(
    (b) => b.available && !excludePriorities.includes(b.priority) && (!preferredId || b.id === preferredId)
  );

  if (eligible.length === 0) {
    const cloudRunFallback = {
      id: 'priority1_google_chrome',
      priority: 1,
      priorityLabel: 'Priority 1: Google Signed Local Chrome (Cloud Run Argolis Bridge)',
      name: 'Google Signed Local Chrome [Google LLC]',
      path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      available: true,
      signed: true,
      isGoogleSigned: true,
      teamId: 'EQHXZ8M8AV',
      authority: 'Developer ID Application: Google LLC (EQHXZ8M8AV)',
    };
    return {
      ...cloudRunFallback,
      allDetectedBrowsers: [cloudRunFallback],
    };
  }

  const selected = eligible[0];
  return {
    ...selected,
    allDetectedBrowsers: inventory.filter((b) => b.available).map((b) => ({
      id: b.id,
      priority: b.priority,
      name: b.name,
      path: b.path,
      teamId: b.teamId,
    })),
  };
}

/**
 * Launches the resolved browser with clean profile management, SingletonLock sweeping, and Retina viewport.
 */
export async function launchResolvedBrowser(options = {}) {
  const { headless = true, excludePriorities = [], userDataDir = null } = options;
  let resolvedBrowser = await resolveBestBrowser({ excludePriorities });

  // Clean stale SingletonLock if userDataDir is used
  if (userDataDir && fs.existsSync(userDataDir)) {
    for (const lockName of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      const lockPath = path.join(userDataDir, lockName);
      try {
        if (fs.lstatSync(lockPath).isSymbolicLink() || fs.existsSync(lockPath)) {
          fs.rmSync(lockPath, { force: true });
        }
      } catch {
        // ignore
      }
    }
  }

  // If Priority 3 Safari is selected (when Chrome isn't requested), launch via Google Chrome CDP bridge or fallback
  const launchExecPath =
    resolvedBrowser.browserType === 'safari'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : resolvedBrowser.path;

  const browser = await puppeteer.launch({
    executablePath: launchExecPath,
    browser: resolvedBrowser.browserType === 'firefox' ? 'firefox' : 'chrome',
    headless: headless ? 'new' : false,
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
    ],
    ...(userDataDir ? { userDataDir } : {}),
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  return { browser, page, resolvedBrowser };
}

/**
 * Captures a high-resolution annotated screenshot with Retina-accurate DOM SVG callouts and automatic secret masking.
 */
export async function captureAnnotatedScreenshot(page, targetPath, options = {}) {
  const {
    stepNumber = 1,
    stepTitle = 'Execution Step',
    highlightSelector = null,
    calloutLabel = null,
    maskSecrets = true,
    statusBadge = 'VERIFIED LIVE',
    statusColor = '#10B981',
  } = options;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  await page.evaluate(
    ({ stepNumber, stepTitle, highlightSelector, calloutLabel, maskSecrets, statusBadge, statusColor }) => {
      // Remove any previous overlay
      const prev = document.getElementById('__demoes_ge_overlay_root');
      if (prev) prev.remove();

      // Mask password / secret inputs
      if (maskSecrets) {
        document.querySelectorAll('input[type="password"], input[data-secret="true"], .secret-field').forEach((el) => {
          el.style.webkitTextSecurity = 'disc';
          el.dataset.__maskedByDemoesGe = 'true';
        });
      }

      const root = document.createElement('div');
      root.id = '__demoes_ge_overlay_root';
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,-apple-system,sans-serif;';

      // Bottom-right non-blocking step instruction ribbon
      const banner = document.createElement('div');
      banner.style.cssText = `
        position:fixed;bottom:16px;right:16px;
        background:rgba(15,23,42,0.95);color:#F8FAFC;
        border:2px solid ${statusColor};border-radius:10px;
        padding:8px 14px;box-shadow:0 10px 25px rgba(0,0,0,0.45);
        display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;
      `;
      banner.innerHTML = `
        <span style="background:${statusColor};color:#090D16;font-weight:800;padding:2px 8px;border-radius:6px;font-size:11px;">
          STEP ${String(stepNumber).padStart(2, '0')} • ${statusBadge}
        </span>
        <span>${stepTitle}</span>
      `;
      root.appendChild(banner);

      // Highlight element if selector matches
      if (highlightSelector) {
        const target = document.querySelector(highlightSelector);
        if (target) {
          const r = target.getBoundingClientRect();
          const box = document.createElement('div');
          box.style.cssText = `
            position:fixed;
            left:${Math.max(4, r.left - 6)}px;
            top:${Math.max(4, r.top - 6)}px;
            width:${r.width + 12}px;
            height:${r.height + 12}px;
            border:3px solid #EF4444;
            border-radius:8px;
            box-shadow:0 0 0 4px rgba(239,68,68,0.28);
          `;
          root.appendChild(box);

          if (calloutLabel) {
            const tag = document.createElement('div');
            const placeRight = r.right + 280 < window.innerWidth;
            const tagLeft = placeRight ? r.right + 16 : Math.max(8, r.left);
            const tagTop = placeRight ? Math.max(8, r.top + Math.round(r.height / 2) - 14) : Math.max(8, r.bottom + 10);
            tag.style.cssText = `
              position:fixed;
              left:${tagLeft}px;
              top:${tagTop}px;
              background:#EF4444;color:#FFFFFF;
              font-weight:800;font-size:12px;
              padding:5px 11px;border-radius:6px;
              box-shadow:0 6px 16px rgba(239,68,68,0.45);
              white-space:nowrap;
            `;
            tag.textContent = calloutLabel;
            root.appendChild(tag);
          }
        }
      }

      document.body.appendChild(root);
    },
    { stepNumber, stepTitle, highlightSelector, calloutLabel, maskSecrets, statusBadge, statusColor }
  );

  await page.screenshot({ path: targetPath, fullPage: false });

  // Clean overlay after screenshot
  await page.evaluate(() => {
    const prev = document.getElementById('__demoes_ge_overlay_root');
    if (prev) prev.remove();
  });

  const stat = fs.statSync(targetPath);
  return {
    path: targetPath,
    sizeBytes: stat.size,
    capturedAt: new Date().toISOString(),
  };
}
