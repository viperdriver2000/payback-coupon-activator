FROM node:20-slim

# Chrome + Display-Stack Dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    cron \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    procps \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer soll das System-Chromium verwenden
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DISPLAY=:99

WORKDIR /app

# Dependencies installieren
COPY package.json ./
RUN npm install --production

# App-Dateien kopieren
COPY payback-coupons.js ./
COPY run-coupons.sh ./
COPY entrypoint.sh ./
RUN chmod +x run-coupons.sh entrypoint.sh

# Daten-Verzeichnis (Cookies + Logs)
RUN mkdir -p /data/logs

VOLUME ["/data"]

EXPOSE 6081

ENTRYPOINT ["/app/entrypoint.sh"]
