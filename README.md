# PAYBACK Coupon Activator 🎯

Automatische Aktivierung aller verfügbaren PAYBACK Coupons per Docker Container.

Läuft als Cronjob im Hintergrund und aktiviert täglich alle neuen Coupons über einen headless Chromium Browser mit Puppeteer.

## Features

- Automatische Aktivierung aller verfügbaren Coupons inkl. Pagination
- Läuft headless als Docker Container (kein GUI nötig)
- Konfigurierbarer Cronjob-Zeitplan
- Cookie-basiertes Login (einmalig manuell, dann automatisch)
- Session wird nach jedem Durchlauf automatisch verlängert
- Tägliche Log-Dateien zur Nachverfolgung
- Ressourcen-Limits für den Container

## Voraussetzungen

- Docker & Docker Compose
- PAYBACK Account
- Für den initialen Login: Ein Rechner mit grafischer Oberfläche (Browser)

## Setup

### 1. Repository klonen

```bash
git clone https://github.com/viperdriver2000/payback-coupon-activator.git
cd payback-coupon-activator
```

### 2. Image bauen

```bash
docker compose build
```

### 3. Einmalig manuell einloggen

PAYBACK nutzt ein Captcha beim Login, daher muss der erste Login manuell in einem Browser erfolgen. Die Session-Cookies werden gespeichert und für alle weiteren automatischen Durchläufe wiederverwendet.

**Option A – Lokaler Rechner mit GUI (empfohlen):**

```bash
docker compose run --rm \
  -e LOGIN_MODE=true \
  -e DISPLAY=$DISPLAY \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  payback
```

Ein Chromium-Fenster öffnet sich. Bei PAYBACK einloggen – die Cookies werden automatisch gespeichert sobald der Login abgeschlossen ist.

**Option B – Login lokal, Cookies auf Server kopieren:**

Falls der Container auf einem headless Server laufen soll:

1. Login auf dem lokalen Rechner durchführen (Option A)
2. Cookies aus dem Docker Volume extrahieren:
   ```bash
   docker run --rm \
     -v payback-docker_payback-data:/data \
     -v $(pwd):/export \
     alpine cp /data/cookies.json /export/cookies.json
   ```
3. Cookies auf den Server kopieren:
   ```bash
   scp cookies.json user@server:/tmp/cookies.json
   ```
4. Auf dem Server ins Docker Volume legen:
   ```bash
   docker volume inspect payback-docker_payback-data  # Mountpoint prüfen
   cp /tmp/cookies.json /var/lib/docker/volumes/payback-docker_payback-data/_data/cookies.json
   ```

### 4. Container starten

```bash
docker compose up -d
```

Fertig! Der Container läuft im Hintergrund und aktiviert täglich alle neuen Coupons.

## Konfiguration

Alle Einstellungen werden über Umgebungsvariablen in der `docker-compose.yml` gesteuert:

| Variable | Standard | Beschreibung |
|---|---|---|
| `CRON_SCHEDULE` | `0 8 * * *` | Cronjob-Zeitplan |
| `RUN_ON_START` | `false` | Beim Container-Start direkt ausführen |
| `HEADLESS` | `true` | Browser ohne GUI |

### Cron-Zeitplan Beispiele

| Zeitplan | Beschreibung |
|---|---|
| `0 8 * * *` | Täglich um 08:00 Uhr |
| `0 */12 * * *` | Alle 12 Stunden |
| `0 8,20 * * *` | Täglich um 08:00 und 20:00 Uhr |
| `30 7 * * 1` | Montags um 07:30 Uhr |

## Verwendung

```bash
# Container starten
docker compose up -d

# Container stoppen
docker compose down

# Logs anzeigen (live)
docker compose logs -f payback

# Manuell ausführen
docker compose run --rm --entrypoint "" payback node /app/payback-coupons.js

# Detaillierte Logs eines bestimmten Tages
docker compose exec payback cat /data/logs/payback-2025-02-10.log

# Cron-Log
docker compose exec payback cat /data/logs/cron.log
```

## Bookmarklet

Alternativ zur Docker-Lösung kann das folgende Bookmarklet im Browser verwendet werden, um alle Coupons manuell zu aktivieren. Einfach ein neues Lesezeichen anlegen und folgenden Code als URL einfügen:

```javascript
javascript:(async () => {
    const url = 'https://www.payback.de/coupons';
    if (!location.href.startsWith(url)) { location.href = url; return; }
    let totalActivated = 0, pageNum = 1;
    while (true) {
        console.log("Verarbeite Seite " + pageNum + "...");
        const cc = document.querySelector("pb-coupon-center");
        if (!cc?.shadowRoot) break;
        const coupons = cc.shadowRoot.querySelectorAll("pbc-coupon");
        let activated = 0;
        for (const c of coupons) {
            const btn = c.shadowRoot?.querySelector("pbc-coupon-call-to-action")
                ?.shadowRoot?.querySelector(".not-activated");
            if (btn) { btn.click(); activated++; await new Promise(r => setTimeout(r, 150)); }
        }
        totalActivated += activated;
        console.log("Seite " + pageNum + ": " + activated + " Coupons aktiviert");
        const pagination = cc.shadowRoot.querySelector("pbc-pagination");
        const nextBtn = pagination?.shadowRoot
            ?.querySelector('[data-test="next-page"]:not([disabled])');
        if (!nextBtn) break;
        nextBtn.click(); pageNum++;
        await new Promise(r => setTimeout(r, 1000));
    }
    alert("Fertig! " + totalActivated + " Coupons auf " + pageNum + " Seite(n) aktiviert.");
})();
```

Dazu auf `https://www.payback.de/coupons` navigieren, einloggen und das Bookmarklet klicken.

## Projektstruktur

```
.
├── docker-compose.yml      # Container-Konfiguration
├── Dockerfile              # Image mit Node.js + Chromium
├── payback-coupons.js      # Hauptscript (Login + Coupon-Aktivierung)
├── entrypoint.sh           # Container-Entrypoint (Cron-Setup)
├── run-coupons.sh          # Wrapper für den Cronjob
├── package.json            # Node.js Dependencies
├── .gitignore              # Schützt sensible Dateien
└── README.md
```

## Troubleshooting

**"Keine Cookies gefunden"**
→ Login-Schritt (Schritt 3) wurde noch nicht durchgeführt.

**"Session abgelaufen"**
→ Cookies sind nicht mehr gültig. Login-Schritt wiederholen.

**"0 Coupons aktiviert"**
→ Alle Coupons waren bereits aktiviert. Das ist normal wenn das Script täglich läuft und seit dem letzten Durchlauf keine neuen Coupons hinzugekommen sind.

**Container startet nicht**
→ `docker compose logs payback` für Fehlerdetails prüfen.

**"page.waitForTimeout is not a function"**
→ Veraltete Version von `payback-coupons.js`. Sicherstellen, dass die aktuelle Version mit der `sleep()` Helper-Funktion verwendet wird.

## Hinweise

- Die PAYBACK-Session läuft nach einiger Zeit ab. Wenn die Logs "Session abgelaufen" melden, muss der Login-Schritt wiederholt werden.
- Das Script navigiert durch alle Coupon-Seiten (Pagination) und aktiviert auch Coupons auf Folgeseiten.
- Nach jedem erfolgreichen Durchlauf werden die Cookies aktualisiert, um die Session zu verlängern.
- Die Selektoren basieren auf der Shadow-DOM-Struktur der PAYBACK-Webseite (Stand: Februar 2026). Bei Änderungen an der Webseite müssen die Selektoren ggf. angepasst werden.

## Lizenz

MIT
