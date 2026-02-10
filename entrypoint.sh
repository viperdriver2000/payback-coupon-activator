#!/bin/bash
set -e

# ============================================================
# Container Entrypoint
# ============================================================

if [ "$LOGIN_MODE" = "true" ]; then
    echo "========================================"
    echo "  LOGIN MODUS"
    echo "  Browser wird geöffnet..."
    echo "  Bitte manuell bei PAYBACK einloggen."
    echo "========================================"
    cd /app
    node payback-coupons.js
    exit 0
fi

echo "========================================"
echo "  PAYBACK Coupon Activator"
echo "  Automatischer Modus"
echo "  Zeitplan: ${CRON_SCHEDULE:-0 8 * * *}"
echo "========================================"

# Logs-Verzeichnis erstellen
mkdir -p /data/logs

# Cron-Job einrichten
CRON_SCHEDULE="${CRON_SCHEDULE:-0 8 * * *}"
echo "${CRON_SCHEDULE} /app/run-coupons.sh" > /etc/cron.d/payback-cron
echo "" >> /etc/cron.d/payback-cron
chmod 0644 /etc/cron.d/payback-cron
crontab /etc/cron.d/payback-cron

echo "Cronjob eingerichtet: ${CRON_SCHEDULE}"
echo "Logs unter: /data/logs/"

# Optional: Beim Start direkt einmal ausführen
if [ "$RUN_ON_START" = "true" ]; then
    echo "Führe initiale Aktivierung durch..."
    /app/run-coupons.sh
fi

# Cron starten und Container am Laufen halten
cron -f
