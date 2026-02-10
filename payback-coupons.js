const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// ============================================================
// PAYBACK Coupon Aktivierung - Docker Edition
// ============================================================
// Beim ersten Start: LOGIN_MODE=true → Browser öffnet sich,
// du loggst dich manuell ein, Cookies werden gespeichert.
// Danach läuft alles automatisch per Cronjob.
// ============================================================

// Helper: Warten (ersetzt das entfernte page.waitForTimeout)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COOKIES_PATH = "/data/cookies.json";
const LOG_PATH = "/data/logs";
const COUPON_URL = "https://www.payback.de/coupons";
const LOGIN_URL = "https://www.payback.de/login";
const LOGIN_MODE = process.env.LOGIN_MODE === "true";
const HEADLESS = process.env.HEADLESS !== "false";

// Logging
function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);

  // Log-Datei schreiben
  if (!fs.existsSync(LOG_PATH)) {
    fs.mkdirSync(LOG_PATH, { recursive: true });
  }
  const logFile = path.join(LOG_PATH, `payback-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logFile, line + "\n");
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
    // Auf der Coupon-Seite prüfen ob wir weitergeleitet werden
    await page.goto(COUPON_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(3000);
    const url = page.url();
    // Wenn wir auf Login umgeleitet werden, sind wir nicht eingeloggt
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
// LOGIN MODUS - Einmalig manuell einloggen
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

  // Bestehende Cookies laden falls vorhanden
  const existingCookies = loadCookies();
  if (existingCookies) {
    await page.setCookie(...existingCookies);
    log("Bestehende Cookies geladen");
  }

  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

  log("Warte auf manuellen Login... (Seite wird überwacht)");
  log("Sobald du auf der Coupon-Seite oder der Startseite landest, werden die Cookies gespeichert.");

  // Warten bis der User eingeloggt ist
  // Wir prüfen alle 3 Sekunden ob die URL sich geändert hat
  let loggedIn = false;
  while (!loggedIn) {
    await sleep(3000);
    const url = page.url();
    if (!url.includes("/login") && url.includes("payback.de")) {
      // Nochmal kurz warten damit alle Cookies gesetzt sind
      await sleep(5000);
      loggedIn = true;
    }
  }

  await saveCookies(page);
  log("Login erfolgreich! Cookies wurden gespeichert.");
  log("Du kannst den Container jetzt mit Ctrl+C beenden.");
  log("Starte danach den Container im normalen Modus (ohne LOGIN_MODE).");

  // Browser offen lassen damit der User es sieht
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
    log("FEHLER: Keine Cookies gefunden! Bitte zuerst LOGIN_MODE=true ausführen.");
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

    // User-Agent setzen damit es nicht wie ein Bot aussieht
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 900 });

    // Cookies setzen
    await page.setCookie(...cookies);
    log("Cookies geladen");

    // Prüfen ob noch eingeloggt
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      log("FEHLER: Session abgelaufen! Bitte erneut LOGIN_MODE=true ausführen.");
      await browser.close();
      process.exit(2);
    }

    log("Login-Status: OK");

    // Zur Coupon-Seite navigieren
    await page.goto(COUPON_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(5000);

    let totalActivated = 0;
    let pageNum = 1;

    while (true) {
      log("Verarbeite Seite " + pageNum + "...");

      // Coupons über Shadow DOM aktivieren
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

      // Nächste Seite
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
      await sleep(2000); // Warten auf Seitenladung
    }

    // Cookies aktualisieren (Session verlängern)
    await saveCookies(page);

    log("=== ERGEBNIS ===");
    log("Gesamt: " + totalActivated + " Coupons auf " + pageNum + " Seite(n) aktiviert");
    log("=== FERTIG ===");
  } catch (e) {
    log("FEHLER: " + e.message);
    log(e.stack);
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
    process.exit(1);
  }
})();
