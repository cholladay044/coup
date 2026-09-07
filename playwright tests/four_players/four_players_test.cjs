const { chromium } = require('playwright-core');
const { io } = require('socket.io-client');

const TOTAL_PLAYERS = 4; // a mid-range count between MIN_PLAYERS (2) and MAX_PLAYERS (6)

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173');

  await page.fill('input[placeholder="Enter a name"]', 'Viewer');
  // Home has two "Create Room" buttons: the mode-toggle tab and the form's submit button.
  // Target the submit button specifically (class "primary") to avoid clicking the tab.
  await page.click('button.primary:has-text("Create Room")');

  await page.waitForSelector('.room-code-box strong', { timeout: 10000 });
  const roomCode = (await page.textContent('.room-code-box strong'))?.trim();
  console.log('room code:', roomCode);
  if (!roomCode || roomCode.length !== 4) throw new Error(`unexpected room code: "${roomCode}"`);

  const bots = [];
  for (let i = 2; i <= TOTAL_PLAYERS; i++) {
    const s = io('http://localhost:3001');
    await new Promise((resolve, reject) => {
      s.on('connect', () => {
        s.emit('room:join', { code: roomCode, name: `Player${i}` }, (res) => {
          if (res?.ok) resolve(); else reject(new Error(res?.error));
        });
      });
    });
    bots.push(s);
  }
  console.log(`${TOTAL_PLAYERS - 1} bot(s) joined`);

  await page.waitForTimeout(1000);
  await page.click('button:has-text("Start Game")');
  await page.waitForSelector('.game-screen', { timeout: 10000 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'playwright tests/four_players/four_players_screenshot.png', fullPage: true });
  console.log('screenshot saved');

  for (const s of bots) s.disconnect();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
