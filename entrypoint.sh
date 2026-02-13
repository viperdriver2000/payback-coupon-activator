#!/usr/bin/bash
set -e

# ============================================================
# Display-Stack starten (Xvfb + Fluxbox + x11vnc + noVNC)
# ============================================================
start_display() {
    echo "Display-Stack wird gestartet..."

    # Xvfb (virtuelles Display)
    Xvfb :99 -screen 0 1280x900x24 &
    sleep 1

    # Fluxbox Window Manager
    fluxbox &
    sleep 1

    # x11vnc (VNC-Server auf Port 5900)
    x11vnc -display :99 -forever -nopw -rfbport 5900 -shared -quiet &
    sleep 1

    # noVNC (WebSocket-Proxy auf Port 6081 -> VNC 5900)
    websockify --web /usr/share/novnc/ 6081 localhost:5900 &
    sleep 1

    echo "noVNC erreichbar unter: http://<host>:6081/vnc.html"
}

# ============================================================
# Container Entrypoint
# ============================================================

# Display immer starten (fuer Login-Modus und Debugging)
start_display

if [ "$LOGIN_MODE" = "true" ]; then
    echo "========================================"
    echo "  LOGIN MODUS"
    echo "  Browser oeffnet sich auf dem Display."
    echo "  Oeffne noVNC und logge dich ein!"
    echo "========================================"
    cd /app
    node payback-coupons.js
    exit 0
fi

echo "========================================"
echo "  PAYBACK Coupon Activator"
echo "  Automatischer Modus"
echo "  Zeitplan: ${CRON_SCHEDULE:-0 8 * * *}"
echo "  noVNC:    http://<host>:6081/vnc.html"
echo "========================================"

# Logs-Verzeichnis erstellen
mkdir -p /data/logs

# Cron-Job einrichten (mit PATH fuer node!)
CRON_SCHEDULE="${CRON_SCHEDULE:-0 8 * * *}"
{
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    echo "DISPLAY=:99"
    echo "${CRON_SCHEDULE} /app/run-coupons.sh"
    echo ""
} > /etc/cron.d/payback-cron
chmod 0644 /etc/cron.d/payback-cron
crontab /etc/cron.d/payback-cron

echo "Cronjob eingerichtet: ${CRON_SCHEDULE}"
echo "Logs unter: /data/logs/"

# Optional: Beim Start direkt einmal ausfuehren
if [ "$RUN_ON_START" = "true" ]; then
    echo "Fuehre initiale Aktivierung durch..."
    /app/run-coupons.sh
fi

# Cron starten und Container am Laufen halten
cron -f
