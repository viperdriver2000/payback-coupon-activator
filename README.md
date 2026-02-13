# PAYBACK Coupon Activator

Automatische Aktivierung aller verfügbaren PAYBACK Coupons per Docker Container.

Läuft als Cronjob im Hintergrund und aktiviert täglich alle neuen Coupons über einen headless Chromium Browser mit Puppeteer. Integriertes noVNC-Display für manuellen Login und Debugging.

## Features

- Automatische Aktivierung aller verfügbaren Coupons inkl. Pagination
- Läuft headless als Docker Container
- **noVNC Web-Display** (Port 6081) für Login und Debugging
- Konfigurierbarer Cronjob-Zeitplan
- Cookie-basiertes Login (einmalig manuell via noVNC, dann automatisch)
- Session wird nach jedem Durchlauf automatisch verlängert
- Tägliche Log-Dateien zur Nachverfolgung
- Ressourcen-Limits für den Container

## Voraussetzungen

- Docker & Docker Compose
- PAYBACK Account

## Setup

### 1. Repository klonen

```bash
git clone https://github.com/viperdriver2000/payback-coupon-activator.git
cd payback-coupon-activator
```

### 2. Credentials konfigurieren

Erstelle eine `docker-compose.override.yml` mit deinen Zugangsdaten:

```yaml
services:
  payback:
    environment:
      - PAYBACK_USERNAME=deine@email.de
      - PAYBACK_PASSWORD=deinPasswort
```

Diese Datei ist in `.gitignore` eingetragen und wird nicht committet.

### 3. Image bauen und starten

```bash
docker compose build
docker compose up -d
```

### 4. Einmalig manuell einloggen

PAYBACK nutzt ein Captcha beim Login, daher muss der erste Login manuell erfolgen.

1. Container im Login-Modus starten:
   ```bash
   docker compose run --rm -e LOGIN_MODE=true -p 6081:6081 payback
   ```
2. noVNC im Browser öffnen: `http://<server-ip>:6081/vnc.html`
3. Im Browser-Fenster bei PAYBACK einloggen
4. Cookies werden automatisch gespeichert
5. Container mit Ctrl+C beenden, danach normal starten:
   ```bash
   docker compose up -d
   ```

Im normalen Betrieb läuft noVNC auf Port 6081 dauerhaft mit. Das ist nützlich um den Status zu prüfen oder bei Session-Ablauf erneut einzuloggen.

## Konfiguration

Einstellungen über Umgebungsvariablen in `docker-compose.yml`:

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

## Verwendung

```bash
# Container starten
docker compose up -d

# Container stoppen
docker compose down

# Logs anzeigen (live)
docker compose logs -f payback

# Manuell ausführen
docker exec payback-coupons /app/run-coupons.sh

# Tages-Log anzeigen
docker exec payback-coupons cat /data/logs/payback-2026-02-13.log

# Cron-Log
docker exec payback-coupons cat /data/logs/cron.log

# noVNC öffnen (Browser)
# http://<server-ip>:6081/vnc.html
```

## Projektstruktur

```
.
├── docker-compose.yml          # Container-Konfiguration
├── docker-compose.override.yml # Credentials (nicht im Repo)
├── Dockerfile                  # Image: Node.js + Chromium + noVNC
├── payback-coupons.js          # Hauptscript (Login + Coupon-Aktivierung)
├── entrypoint.sh               # Entrypoint (Display-Stack + Cron)
├── run-coupons.sh              # Wrapper für den Cronjob
├── package.json                # Node.js Dependencies
└── .gitignore
```

## Display-Stack

Der Container enthält einen vollständigen Display-Stack:

| Komponente | Funktion |
|---|---|
| Xvfb | Virtuelles Display (:99) |
| Fluxbox | Leichtgewichtiger Window Manager |
| x11vnc | VNC-Server (Port 5900 intern) |
| noVNC/websockify | Web-VNC-Client (Port 6081) |

## Troubleshooting

**"Keine Cookies gefunden"**
→ Login-Schritt (Schritt 4) wurde noch nicht durchgeführt.

**"Session abgelaufen"**
→ Cookies sind nicht mehr gültig. Erneut via noVNC einloggen oder Login-Modus starten.

**"0 Coupons aktiviert"**
→ Alle Coupons waren bereits aktiviert. Normal wenn keine neuen Coupons seit dem letzten Lauf.

**"node: command not found" im Cron-Log**
→ PATH fehlt in der Cron-Konfiguration. Aktuelle Version des Entrypoints verwenden.

**noVNC zeigt leeren Desktop**
→ Normal im Automatik-Modus. Der Browser läuft headless. Im Login-Modus öffnet sich ein Chromium-Fenster.

## Bookmarklet

Alternativ kann dieses Bookmarklet im Browser alle Coupons manuell aktivieren:

```javascript
javascript:(async () => {
    const url = 'https://www.payback.de/coupons';
    if (!location.href.startsWith(url)) { location.href = url; return; }
    let totalActivated = 0, pageNum = 1;
    while (true) {
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

## Lizenz

MIT
