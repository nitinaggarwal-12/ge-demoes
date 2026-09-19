import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('scratch/screenshots_byomcp_step1');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const userDataDir = '/tmp/chrome_profile_ge_test';
  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir,
    args: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1600,1000',
      '--ignore-certificate-errors',
    ],
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();
    const targetUrl = 'https://ucs-widget.corp.google.com/home/cid/fdd1e98d-1f52-4407-98fd-80e27c61fbc9?e=SparkDogfoodLaunch%3A%3ALaunch';
    console.log('Navigating to:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch(e => {
      console.log('Navigation note:', e.message);
    });
    await new Promise(r => setTimeout(r, 4000));
    const finalUrl = page.url();
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    console.log('Final URL:', finalUrl);
    console.log('Title:', title);
    console.log('Body Text Preview:', bodyText);

    const shotPath = path.join(OUT_DIR, '01_ge_instance_ucs_widget_state.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('Saved screenshot:', shotPath);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
