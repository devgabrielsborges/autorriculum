import { chromium } from 'playwright';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const STATE_FILE = 'state.json';

(async () => {
  const username = process.env.LINKEDIN_USERNAME;
  const password = process.env.LINKEDIN_PASSWORD;

  if (!username || !password) {
    console.error('Missing LinkedIn username or password in .env file');
    return;
  }

  const browser = await chromium.launch({ headless: false });
  let context;

  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    context = await browser.newContext({ storageState: state });
    console.log('Loaded saved state.');
  } else {
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://linkedin.com');
    await page.click('[data-tracking-control-name="guest_homepage-basic_nav-header-signin"]');
    
    await page.waitForSelector('#username');
    await page.type('#username', username);
    await page.type('#password', password);
    await page.click('button[type="submit"][aria-label="Sign in"]');

    await page.waitForURL('**/feed/**', { timeout: 60000 });
    console.log('Login successful.');

    const storageState = await context.storageState();
    fs.writeFileSync(STATE_FILE, JSON.stringify(storageState, null, 2));
    console.log('Storage state saved.');
    await page.close();
  }

  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/in/devgabrielsborges/');

  await page.waitForSelector('main');
  await new Promise(resolve => setTimeout(resolve, 3000));

  await page.locator('button:has-text("Recursos")').locator(':visible').click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salvar como PDF' }).click();
  const download = await downloadPromise;

  await download.saveAs('profile.pdf');
  console.log('Profile saved as profile.pdf');

  await new Promise(resolve => setTimeout(resolve, 5000)); // Keep browser open to see result
  await browser.close();
})();
