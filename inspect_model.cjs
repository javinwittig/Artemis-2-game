const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => {
    logs.push(msg.text());
  });
  page.on('pageerror', err => {
    logs.push('ERROR: ' + err.message);
  });
  
  await page.goto('http://localhost:3000/inspect.html', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait for model to load and log
  await page.waitForTimeout(5000);
  
  console.log('=== CONSOLE LOGS ===');
  logs.forEach(log => console.log(log));
  
  await browser.close();
})();