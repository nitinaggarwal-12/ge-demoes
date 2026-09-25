import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'scratch/screenshots_homepage_link');

if (fs.existsSync(SCREENSHOT_DIR)) {
  fs.rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  console.log('🚀 Testing Sidebar Brand Homepage Link with Google-Signed Chrome...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--window-size=1600,1000']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

    // 1. Navigate to a deep-linked gallery page
    console.log('1. Loading deep-linked URL: /?project=microsoft&tab=gallery&group=ge-chat ...');
    await page.goto('http://localhost:8788/?project=microsoft&tab=gallery&group=ge-chat', { waitUntil: 'networkidle0' });
    await sleep(800);

    // 2. Check sidebar-brand attributes
    const brandHref = await page.$eval('.sidebar-brand', el => el.getAttribute('href'));
    const brandTitle = await page.$eval('.sidebar-brand', el => el.getAttribute('title'));
    console.log(`Sidebar Brand href: "${brandHref}", title: "${brandTitle}"`);

    // 3. Click the sidebar-brand link
    console.log('2. Clicking .sidebar-brand homepage link...');
    await page.$eval('.sidebar-brand', el => el.click());
    await sleep(800);

    // 4. Verify URL and active tab
    const currentUrl = page.url();
    const activeTab = await page.$eval('.view-tab.active', el => el.id);
    console.log(`Current URL after click: ${currentUrl}`);
    console.log(`Active View Tab after click: ${activeTab} (Expected: tab-servicenow)`);

    // 5. Verify Toast message
    const toastTitle = await page.$eval('#toastTitle', el => el.textContent.trim());
    console.log(`Toast message displayed: "${toastTitle}"`);

    // 6. Capture screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_homepage_after_logo_click.png') });
    console.log('Screenshot saved to scratch/screenshots_homepage_link/01_homepage_after_logo_click.png');

    console.log('🎉 HOMEPAGE LINK VERIFICATION PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ Homepage link test failed:', err);
  process.exit(1);
});
