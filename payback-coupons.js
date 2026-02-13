const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// ============================================================
// PAYBACK Coupon Aktivierung - Docker Edition
// ============================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COOKIES_PATH = "/data/cookies.json";
const LOG_PATH = "/data/logs";
const COUPON_URL = "https://www.payback.de/coupons";
const LOGIN_URL = "https://www.payback.de/login";
const LOGIN_MODE = process.env.LOGIN_MODE === "true";
const HEADLESS = process.env.HEADLESS !== "false";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Logging
function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);

  if (!fs.existsSync(LOG_PATH)) {
    fs.mkdirSync(LOG_PATH, { recursive: true });
  }
  const logFile = path.join(LOG_PATH, `payback-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logFile, line + "\n");
}

// Telegram-Nachricht senden
async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log("Telegram nicht konfiguriert, ueberspringe Benachrichtigung");
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      log("Telegram-Fehler: " + res.status + " " + (await res.text()));
    }
  } catch (e) {
    log("Telegram-Fehler: " + e.message);
  }
}

// Cookies laden
function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const data = fs.readFileSync(COOKIES_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    log("Fehler beim Laden der Cookies: " + e.message);
  }
  return null;
}

// Cookies speichern
async function saveCookies(page) {
  const cookies = await page.cookies();
  const dir = path.dirname(COOKIES_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  log(`${cookies.length} Cookies gespeichert`);
}

// Prüfen ob eingeloggt
async function isLoggedIn(page) {
  try {
    await page.goto(COUPON_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3000);
    const url = page.url();
    if (url.includes("/login")) {
      return false;
    }
    return true;
  } catch (e) {
    log("Fehler beim Login-Check: " + e.message);
    return false;
  }
}

// ============================================================
// LOGIN MODUS
// ============================================================
async function runLoginMode() {
  log("=== LOGIN MODUS ===");
  log("Browser wird geöffnet. Bitte manuell einloggen!");
  log("Nach erfolgreichem Login werden die Cookies automatisch gespeichert.");

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1280,900",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const existingCookies = loadCookies();
  if (existingCookies) {
    await page.setCookie(...existingCookies);
    log("Bestehende Cookies geladen");
  }

  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

  log("Warte auf manuellen Login... (Seite wird überwacht)");

  let loggedIn = false;
  while (!loggedIn) {
    await sleep(3000);
    const url = page.url();
    if (!url.includes("/login") && url.includes("payback.de")) {
      await sleep(5000);
      loggedIn = true;
    }
  }

  await saveCookies(page);
  log("Login erfolgreich! Cookies wurden gespeichert.");
  await sendTelegram("✅ <b>PAYBACK Login erfolgreich</b>\nCookies wurden gespeichert.");

  await sleep(10000);
  await browser.close();
}

// ============================================================
// COUPON AKTIVIERUNG
// ============================================================
async function activateCoupons() {
  log("=== COUPON AKTIVIERUNG START ===");

  const cookies = loadCookies();
  if (!cookies) {
    log("FEHLER: Keine Cookies gefunden!");
    await sendTelegram("⚠️ <b>PAYBACK Fehler</b>\nKeine Cookies gefunden. Bitte einloggen!\n\n👉 noVNC: http://192.168.84.56:6081/vnc.html");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS ? "new" : false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-audio",
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 900 });

    await page.setCookie(...cookies);
    log("Cookies geladen");

    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      log("FEHLER: Session abgelaufen!");
      await sendTelegram("🔑 <b>PAYBACK Session abgelaufen!</b>\nBitte erneut einloggen.\n\n👉 noVNC: http://192.168.84.56:6081/vnc.html");
      await browser.close();
      process.exit(2);
    }

    log("Login-Status: OK");

    await page.goto(COUPON_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(5000);

    let totalActivated = 0;
    let pageNum = 1;

    while (true) {
      log("Verarbeite Seite " + pageNum + "...");

      const activated = await page.evaluate(async () => {
        let count = 0;

        const couponCenter = document.querySelector("pb-coupon-center");
        if (!couponCenter || !couponCenter.shadowRoot) return count;

        const coupons = couponCenter.shadowRoot.querySelectorAll("pbc-coupon");

        for (const c of coupons) {
          const btn = c.shadowRoot
            ?.querySelector("pbc-coupon-call-to-action")
            ?.shadowRoot?.querySelector(".not-activated");

          if (btn) {
            btn.click();
            count++;
            await new Promise((r) => setTimeout(r, 200));
          }
        }

        return count;
      });

      totalActivated += activated;
      log("Seite " + pageNum + ": " + activated + " Coupons aktiviert");

      const hasNext = await page.evaluate(() => {
        const couponCenter = document.querySelector("pb-coupon-center");
        if (!couponCenter || !couponCenter.shadowRoot) return false;

        const pagination = couponCenter.shadowRoot.querySelector("pbc-pagination");
        if (!pagination || !pagination.shadowRoot) return false;

        const nextBtn = pagination.shadowRoot.querySelector(
          '[data-test="next-page"]:not([disabled])'
        );
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (!hasNext) break;

      pageNum++;
      await sleep(2000);
    }

    await saveCookies(page);

    log("=== ERGEBNIS ===");
    log("Gesamt: " + totalActivated + " Coupons auf " + pageNum + " Seite(n) aktiviert");
    log("=== FERTIG ===");

    // Telegram-Benachrichtigung
    if (totalActivated > 0) {
      await sendTelegram(`🎟 <b>PAYBACK Coupons aktiviert!</b>\n${totalActivated} neue Coupons auf ${pageNum} Seite(n) aktiviert.`);
    } else {
      await sendTelegram(`✅ <b>PAYBACK Check</b>\nKeine neuen Coupons. Alle bereits aktiviert.`);
    }
  } catch (e) {
    log("FEHLER: " + e.message);
    log(e.stack);
    await sendTelegram(`❌ <b>PAYBACK Fehler</b>\n<code>${e.message}</code>`);
  } finally {
    await browser.close();
  }
}

// ============================================================
// HAUPTPROGRAMM
// ============================================================
(async () => {
  try {
    if (LOGIN_MODE) {
      await runLoginMode();
    } else {
      await activateCoupons();
    }
  } catch (e) {
    log("Kritischer Fehler: " + e.message);
    await sendTelegram(`❌ <b>PAYBACK Kritischer Fehler</b>\n<code>${e.message}</code>`);
    process.exit(1);
  }
})();
