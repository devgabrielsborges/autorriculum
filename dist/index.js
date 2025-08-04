"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const STATE_FILE = 'state.json';
(async () => {
    const email = process.env.LINKEDIN_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD;
    const username = process.env.LINKEDIN_USERNAME;
    if (!username || !password || !email) {
        console.error('Missing LinkedIn username or password in .env file');
        return;
    }
    const browser = await playwright_1.chromium.launch({ headless: true });
    let context;
    if (fs.existsSync(STATE_FILE)) {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        context = await browser.newContext({ storageState: state });
        console.log('Loaded saved state.');
    }
    else {
        context = await browser.newContext();
        const page = await context.newPage();
        await page.goto('https://linkedin.com');
        await page.click('[data-tracking-control-name="guest_homepage-basic_nav-header-signin"]');
        await page.waitForSelector('#username');
        await page.type('#username', email);
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
    await page.goto(`https://www.linkedin.com/in/${username}/`);
    await page.waitForSelector('main');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.locator('button:has-text("Recursos")').locator(':visible').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Salvar como PDF' }).click();
    const download = await downloadPromise;
    await download.saveAs('profile.pdf');
    console.log('Profile saved as profile.pdf');
    await browser.close();
})();
