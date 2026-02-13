# PAYBACK Coupon Activator

Automatische Aktivierung aller verfügbaren PAYBACK Coupons per Docker Container.

Läuft als Cronjob im Hintergrund und aktiviert täglich alle neuen Coupons über einen headless Chromium Browser mit Puppeteer. Integriertes noVNC-Display für manuellen Login und Debugging. Telegram-Benachrichtigungen über Ergebnisse und Fehler.

## Features

- Automatische Aktivierung aller verfügbaren Coupons inkl. Pagination
- Läuft headless als Docker Container
- **noVNC Web-Display** (Port 6081) für Login und Debugging
- **Telegram-Benachrichtigungen** (Ergebnisse, Session-Ablauf, Fehler)
- Konfigurierbarer Cronjob-Zeitplan
- Cookie-basiertes Login (einmalig manuell via noVNC, dann automatisch)
- Session wird nach jedem Durchlauf automatisch verlängert
- Tägliche Log-Dateien zur Nachverfolgung

## Voraussetzungen

- Docker & Docker Compose
- PAYBACK Account
- Optional: Telegram Bot (für Benachrichtigungen)

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
      # Optional: Telegram-Benachrichtigungen
      - TELEGRAM_BOT_TOKEN=1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      - TELEGRAM_CHAT_ID=-1234567890
```

Diese Datei ist in `.gitignore` eingetragen und wird nicht committet.

**Telegram Bot erstellen:**
1. In Telegram mit [@BotFather](https://t.me/BotFather) chatten
2. `/newbot` senden und den Anweisungen folgen
3. Bot-Token kopieren → `TELEGRAM_BOT_TOKEN`
4. Chat-ID ermitteln: Bot zur Gruppe hinzufügen, Nachricht senden, dann `https://api.telegram.org/bot<TOKEN>/getUpdates` aufrufen → `TELEGRAM_CHAT_ID`

### 3. Image bauen und starten

```bash
docker compose build
docker compose up -d
```

### 4. Erstmalig einloggen (via noVNC)

PAYBACK nutzt ein Captcha beim Login, daher muss der erste Login manuell über das noVNC-Display erfolgen. Die Session-Cookies werden gespeichert und für alle weiteren automatischen Durchläufe wiederverwendet.

**Variante A – Login-Modus (empfohlen für Ersteinrichtung):**

```bash
# Container im Login-Modus starten (öffnet automatisch einen Browser)
docker compose run --rm -e LOGIN_MODE=true -p 6081:6081 payback
```

Dann im eigenen Browser öffnen: `http://<server-ip>:6081/vnc.html`

Im noVNC-Fenster erscheint ein Chromium-Browser mit der PAYBACK-Login-Seite. Dort einloggen – die Cookies werden automatisch gespeichert sobald der Login abgeschlossen ist. Danach den Container mit Ctrl+C beenden und normal starten:

```bash
docker compose up -d
```

**Variante B – Browser manuell auf dem laufenden Container öffnen:**

Der Container hat im Normalbetrieb ein noVNC-Display auf Port 6081 das dauerhaft läuft. Man kann jederzeit einen Browser darauf öffnen:

```bash
# Chromium auf dem noVNC-Display öffnen
docker exec -d payback-coupons bash -c 'DISPLAY=:99 chromium --no-sandbox --disable-gpu https://www.payback.de/login'
```

Dann im eigenen Browser `http://<server-ip>:6081/vnc.html` öffnen und im Chromium-Fenster einloggen.

Nach dem Login die Cookies speichern:

```bash
# Coupon-Script manuell ausführen (speichert dabei die aktuellen Cookies)
docker exec payback-coupons bash /app/run-coupons.sh
```

Chromium auf dem Display danach schließen:

```bash
docker exec payback-coupons pkill -f chromium
```

## Manuelle Bedienung

### Coupons sofort aktivieren

```bash
docker exec payback-coupons bash /app/run-coupons.sh
```

### Logs prüfen

```bash
# Cron-Log (alle Läufe)
docker exec payback-coupons cat /data/logs/cron.log

# Tages-Log (Detail)
docker exec payback-coupons cat /data/logs/payback-$(date +%Y-%m-%d).log

# Live-Logs des Containers
docker compose logs -f payback
```

### Session erneuern (wenn abgelaufen)

Wenn im Log oder via Telegram "Session abgelaufen" erscheint, muss man sich erneut einloggen:

```bash
# 1. Browser auf dem noVNC-Display öffnen
docker exec -d payback-coupons bash -c 'DISPLAY=:99 chromium --no-sandbox --disable-gpu https://www.payback.de/login'

# 2. Im eigenen Browser noVNC öffnen und bei PAYBACK einloggen:
#    http://<server-ip>:6081/vnc.html

# 3. Nach dem Login Cookies speichern
docker exec payback-coupons bash /app/run-coupons.sh

# 4. Browser auf dem Display schließen
docker exec payback-coupons pkill -f chromium
```

### noVNC (Remote-Desktop)

Der Container hat ein eingebautes Web-Display. Damit kann man jederzeit in den Container schauen:

```bash
# noVNC im Browser öffnen:
# http://<server-ip>:6081/vnc.html

# Chromium auf dem Display starten (z.B. für Debugging):
docker exec -d payback-coupons bash -c 'DISPLAY=:99 chromium --no-sandbox --disable-gpu https://www.payback.de/coupons'

# Chromium wieder schließen:
docker exec payback-coupons pkill -f chromium
```

Beim Verbinden auf "Connect" klicken (kein Passwort nötig). Im Normalbetrieb ist der Desktop leer – Chromium läuft headless im Hintergrund.

### Container-Verwaltung

```bash
# Container starten
docker compose up -d

# Container stoppen
docker compose down

# Container neu bauen (nach Code-Änderungen)
docker compose build && docker compose up -d

# Container-Status prüfen
docker ps --filter name=payback-coupons
```

## Konfiguration

Einstellungen über Umgebungsvariablen in `docker-compose.yml` bzw. `docker-compose.override.yml`:

| Variable | Standard | Beschreibung |
|---|---|---|
| `CRON_SCHEDULE` | `0 8 * * *` | Cronjob-Zeitplan (Cron-Syntax) |
| `RUN_ON_START` | `false` | Beim Container-Start direkt einmal ausführen |
| `HEADLESS` | `true` | Browser ohne GUI (für Cronjob) |
| `LOGIN_MODE` | `false` | Login-Modus: öffnet Browser auf noVNC-Display |
| `PAYBACK_USERNAME` | – | PAYBACK E-Mail (in override.yml) |
| `PAYBACK_PASSWORD` | – | PAYBACK Passwort (in override.yml) |
| `TELEGRAM_BOT_TOKEN` | – | Telegram Bot Token (optional) |
| `TELEGRAM_CHAT_ID` | – | Telegram Chat-ID (optional) |

### Telegram-Benachrichtigungen

Wenn `TELEGRAM_BOT_TOKEN` und `TELEGRAM_CHAT_ID` gesetzt sind, sendet der Container folgende Nachrichten:

| Ereignis | Nachricht |
|---|---|
| Coupons aktiviert | 🎟 **X neue Coupons aktiviert** |
| Keine neuen Coupons | ✅ Alle bereits aktiviert |
| Session abgelaufen | 🔑 Bitte erneut einloggen (mit noVNC-Link) |
| Keine Cookies | ⚠️ Bitte erstmalig einloggen (mit noVNC-Link) |
| Fehler | ❌ Fehlermeldung |

### Cron-Zeitplan Beispiele

| Zeitplan | Beschreibung |
|---|---|
| `0 8 * * *` | Täglich um 08:00 Uhr |
| `0 */12 * * *` | Alle 12 Stunden |
| `0 8,20 * * *` | Täglich um 08:00 und 20:00 Uhr |

## Projektstruktur

```
.
├── docker-compose.yml          # Container-Konfiguration
├── docker-compose.override.yml # Credentials + Telegram (nicht im Repo)
├── Dockerfile                  # Image: Node.js + Chromium + noVNC
├── payback-coupons.js          # Hauptscript (Login + Coupon-Aktivierung + Telegram)
├── entrypoint.sh               # Entrypoint (Display-Stack + Cron)
├── run-coupons.sh              # Wrapper für den Cronjob
├── package.json                # Node.js Dependencies
└── .gitignore
```

## Display-Stack

Der Container enthält einen vollständigen Display-Stack für noVNC:

| Komponente | Funktion |
|---|---|
| Xvfb | Virtuelles Display (:99) |
| Fluxbox | Leichtgewichtiger Window Manager |
| x11vnc | VNC-Server (Port 5900 intern) |
| noVNC/websockify | Web-VNC-Client (Port 6081) |

## Troubleshooting

**"Keine Cookies gefunden"**
→ Erstmaliger Login wurde noch nicht durchgeführt. Siehe Setup Schritt 4.

**"Session abgelaufen"**
→ Cookies sind nicht mehr gültig. Erneut via noVNC einloggen (siehe "Session erneuern"). Du wirst auch via Telegram benachrichtigt.

**"0 Coupons aktiviert"**
→ Alle Coupons waren bereits aktiviert. Normal wenn keine neuen Coupons seit dem letzten Lauf.

**"node: command not found" im Cron-Log**
→ PATH fehlt in der Cron-Konfiguration. Aktuelle Version des Entrypoints verwenden.

**noVNC zeigt leeren Desktop**
→ Normal im Automatik-Modus. Chromium läuft headless. Browser manuell starten zum Interagieren:
```bash
docker exec -d payback-coupons bash -c 'DISPLAY=:99 chromium --no-sandbox --disable-gpu https://www.payback.de'
```

**Keine Telegram-Nachrichten**
→ `TELEGRAM_BOT_TOKEN` und `TELEGRAM_CHAT_ID` in `docker-compose.override.yml` prüfen. Bot muss Mitglied der Gruppe/des Chats sein.

## Bookmarklet

Alternativ kann dieses Bookmarklet im eigenen Browser alle Coupons manuell aktivieren (dazu auf `https://www.payback.de/coupons` eingeloggt sein):

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
