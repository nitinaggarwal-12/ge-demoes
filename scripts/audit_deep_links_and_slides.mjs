import puppeteer from 'puppeteer';

async function audit() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  console.log('--- 1. Testing Default Load ---');
  await page.goto('http://localhost:8788', { waitUntil: 'networkidle0' });
  const activeTabDefault = await page.$eval('.view-tab.active', el => el.id);
  console.log('Default Active Tab:', activeTabDefault);

  console.log('--- 2. Testing Deep Links ---');
  const urls = [
    { url: 'http://localhost:8788/?project=servicenow&tab=servicenow', expected: 'tab-servicenow' },
    { url: 'http://localhost:8788/?project=veeva&tab=veeva', expected: 'tab-veeva' },
    { url: 'http://localhost:8788/?project=microsoft&tab=microsoft', expected: 'tab-microsoft' },
    { url: 'http://localhost:8788/?tab=gallery&group=ground-truth', expected: 'tab-gallery' },
    { url: 'http://localhost:8788/?slide=1', expected: 'modal-open' }
  ];

  for (const item of urls) {
    await page.goto(item.url, { waitUntil: 'networkidle0' });
    if (item.expected === 'modal-open') {
      const modalOpen = await page.$eval('#slideshowModal', el => el.classList.contains('open')).catch(() => false);
      const slideTitle = await page.$eval('#slideTitle', el => el.textContent.trim()).catch(() => 'N/A');
      console.log(`URL: ${item.url} => Modal Open: ${modalOpen}, Slide Title: [${slideTitle}]`);
    } else {
      const activeTab = await page.$eval('.view-tab.active', el => el.id).catch(() => 'none');
      console.log(`URL: ${item.url} => Active Tab: [${activeTab}] (Expected: ${item.expected})`);
    }
  }

  console.log('--- 3. Testing Gallery View for Each Project ---');
  // ServiceNow
  await page.goto('http://localhost:8788/?tab=gallery', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.filterGalleryByProject('servicenow'));
  let visibleGroups = await page.$$eval('.workflow-group-card', cards => cards.filter(c => c.style.display !== 'none').length);
  console.log('ServiceNow Gallery visible groups:', visibleGroups);

  // Veeva
  await page.evaluate(() => window.filterGalleryByProject('veeva'));
  visibleGroups = await page.$$eval('.workflow-group-card', cards => cards.filter(c => c.style.display !== 'none').length);
  console.log('Veeva Gallery visible groups:', visibleGroups);

  // Microsoft
  await page.evaluate(() => window.filterGalleryByProject('microsoft'));
  visibleGroups = await page.$$eval('.workflow-group-card', cards => cards.filter(c => c.style.display !== 'none').length);
  console.log('Microsoft Gallery visible groups:', visibleGroups);

  console.log('--- 4. Checking Console Errors ---');
  if (consoleErrors.length === 0) {
    console.log('No console errors detected! 0 errors.');
  } else {
    console.log(`Found ${consoleErrors.length} console errors:`, consoleErrors);
  }

  await browser.close();
}

audit().catch(console.error);
