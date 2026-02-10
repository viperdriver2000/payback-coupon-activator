#!/bin/bash
# Wird vom Cron-Job aufgerufen
cd /app
export NODE_ENV=production
export HEADLESS=true

echo "$(date '+%Y-%m-%d %H:%M:%S') - Cronjob gestartet" >> /data/logs/cron.log

node payback-coupons.js 2>&1 | tee -a /data/logs/cron.log

echo "$(date '+%Y-%m-%d %H:%M:%S') - Cronjob beendet" >> /data/logs/cron.log
