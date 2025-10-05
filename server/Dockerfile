# Use lightweight Node base image
FROM node:18-slim

ENV DEBIAN_FRONTEND=noninteractive

# --- Install LibreOffice and core fonts ---
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-java-common \
    fonts-dejavu \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-freefont-ttf \
    cabextract \
    xfonts-utils \
    wget \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# --- Manually install Microsoft TrueType fonts (for exact layout match) ---
RUN mkdir -p /usr/share/fonts/truetype/msttcorefonts && \
    cd /usr/share/fonts/truetype/msttcorefonts && \
    wget -q https://downloads.sourceforge.net/corefonts/andale32.exe && cabextract -L andale32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/arial32.exe && cabextract -L arial32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/comic32.exe && cabextract -L comic32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/courie32.exe && cabextract -L courie32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/georgi32.exe && cabextract -L georgi32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/impact32.exe && cabextract -L impact32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/times32.exe && cabextract -L times32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/trebuc32.exe && cabextract -L trebuc32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/verdan32.exe && cabextract -L verdan32.exe && \
    wget -q https://downloads.sourceforge.net/corefonts/webdin32.exe && cabextract -L webdin32.exe && \
    fc-cache -fv && rm -f *.exe

# --- Force LibreOffice to use correct locale and fonts ---
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# Verify installation (optional)
RUN soffice --version && fc-list | grep -i "arial\|times\|calibri\|liberation" || true

# --- Node App Setup ---
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 10000
CMD ["node", "server.js"]
