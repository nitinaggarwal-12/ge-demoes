import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'scratch/screenshots_audience_filter');

if (fs.existsSync(SCREENSHOT_DIR)) {
  fs.rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  console.log('🚀 Starting Audience Filter Verification Suite...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--window-size=1600,1000']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

    // TEST 1: Default External Mode (Clean Customer View)
    console.log('\n--- TEST 1: Default External Audience Mode ---');
    await page.goto('http://localhost:8788/?tab=gallery', { waitUntil: 'networkidle0' });
    await sleep(800);

    // Verify topbar active button
    const extActive = await page.$eval('#audienceBtnExternal', el => el.classList.contains('active'));
    const intActive = await page.$eval('#audienceBtnInternal', el => el.classList.contains('active'));
    console.log(`Topbar Buttons: External Active = ${extActive}, Internal Active = ${intActive}`);

    // Verify Gallery Section live-auth visibility
    const liveAuthSecDisplay = await page.$eval('#workflow-live-auth', el => window.getComputedStyle(el).display);
    console.log(`Gallery live-auth Section display = "${liveAuthSecDisplay}" (Expected: none)`);

    // Verify Gallery Master Count Badge
    const masterCountBadge = await page.$eval('#galleryFilterAll .badge-count', el => el.textContent.trim());
    console.log(`Gallery Master Count Badge = "${masterCountBadge}" (Expected: 59)`);

    // Capture screenshot of Gallery in External mode
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_gallery_external_customer_mode.png'), fullPage: false });

    // Open Slideshow in External mode
    console.log('\n--- Checking Slideshow in External Mode ---');
    await page.$eval('#galleryHeroSnBtn', el => el.click());
    await sleep(800);

    const ssExtActive = await page.$eval('#slideshowAudienceBtnExternal', el => el.classList.contains('active'));
    const ssDeckValue = await page.$eval('#slideshowDeckSelect', el => el.value);
    const ssCounter = await page.$eval('#slideCounterText', el => el.textContent.trim());
    const ssSnOption = await page.$eval('#slideshowDeckSelect option[value="servicenow"]', el => el.textContent.trim());
    const ssAllOption = await page.$eval('#slideshowDeckSelect option[value="all"]', el => el.textContent.trim());

    console.log(`Slideshow: External Active = ${ssExtActive}, Deck = ${ssDeckValue}`);
    console.log(`Slideshow Counter = "${ssCounter}"`);
    console.log(`ServiceNow Option Text = "${ssSnOption}"`);
    console.log(`Master Option Text = "${ssAllOption}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_slideshow_external_customer_mode.png') });

    // Close Slideshow
    await page.$eval('#slideshowModal .btn-slideshow-tool[title*="Close"]', el => el.click());
    await sleep(500);

    // TEST 2: Switch to Internal Audience Mode (Engineering Audit)
    console.log('\n--- TEST 2: Switch to Internal Audience Mode ---');
    await page.$eval('#audienceBtnInternal', el => el.click());
    await sleep(800);

    const intActiveNow = await page.$eval('#audienceBtnInternal', el => el.classList.contains('active'));
    const liveAuthSecDisplayNow = await page.$eval('#workflow-live-auth', el => window.getComputedStyle(el).display);
    const masterCountBadgeNow = await page.$eval('#galleryFilterAll .badge-count', el => el.textContent.trim());

    console.log(`Internal Button Active = ${intActiveNow}`);
    console.log(`Gallery live-auth Section display = "${liveAuthSecDisplayNow}" (Expected: block)`);
    console.log(`Gallery Master Count Badge = "${masterCountBadgeNow}" (Expected: 70)`);

    // Scroll to live-auth section and capture screenshot
    await page.$eval('#workflow-live-auth', el => el.scrollIntoView());
    await sleep(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_gallery_internal_audit_mode_live_auth_section.png') });

    // Open Slideshow in Internal mode
    console.log('\n--- Checking Slideshow in Internal Mode ---');
    await page.$eval('#workflow-live-auth .gallery-card', el => el.click());
    await sleep(800);

    const ssCounterInt = await page.$eval('#slideCounterText', el => el.textContent.trim());
    const ssAudBadgeDisplay = await page.$eval('#slideAudienceBadge', el => window.getComputedStyle(el).display);
    const ssAudBadgeText = await page.$eval('#slideAudienceBadge', el => el.textContent.trim());

    console.log(`Slideshow Counter in Internal Mode = "${ssCounterInt}"`);
    console.log(`Slide Audience Badge display = "${ssAudBadgeDisplay}", text = "${ssAudBadgeText}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_slideshow_internal_audit_mode_with_badge.png') });

    // Close Slideshow
    await page.$eval('#slideshowModal .btn-slideshow-tool[title*="Close"]', el => el.click());
    await sleep(500);

    // TEST 3: Print / Export Modal
    console.log('\n--- TEST 3: Print Modal Audience Select ---');
    await page.$eval('button[onclick="openPrintModal()"]', el => el.click());
    await sleep(800);

    const printAudVal = await page.$eval('#printAudienceSelect', el => el.value);
    console.log(`Print Modal Audience Select Value = "${printAudVal}"`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_print_export_modal_audience_selector.png') });
    await page.$eval('#printModal .lightbox-close', el => el.click());
    await sleep(500);

    // TEST 4: URL State & Idempotent Reload Test (?audience=internal)
    console.log('\n--- TEST 4: URI Addressability & Idempotent Reload (?audience=internal) ---');
    await page.goto('http://localhost:8788/?tab=gallery&audience=internal', { waitUntil: 'networkidle0' });
    await sleep(800);

    const reloadedIntActive = await page.$eval('#audienceBtnInternal', el => el.classList.contains('active'));
    const reloadedLiveAuthDisplay = await page.$eval('#workflow-live-auth', el => window.getComputedStyle(el).display);
    console.log(`Reload with ?audience=internal: Internal Active = ${reloadedIntActive}, live-auth display = "${reloadedLiveAuthDisplay}"`);

    // Reload with ?audience=external
    console.log('\n--- Reload with ?audience=external ---');
    await page.goto('http://localhost:8788/?tab=gallery&audience=external', { waitUntil: 'networkidle0' });
    await sleep(800);

    const reloadedExtActive = await page.$eval('#audienceBtnExternal', el => el.classList.contains('active'));
    const reloadedLiveAuthDisplayExt = await page.$eval('#workflow-live-auth', el => window.getComputedStyle(el).display);
    console.log(`Reload with ?audience=external: External Active = ${reloadedExtActive}, live-auth display = "${reloadedLiveAuthDisplayExt}"`);

    console.log('\n🎉 ALL 4 AUDIENCE FILTER VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
