# Use Node 18 slim image
FROM node:18-slim

# Set non-interactive mode
ENV DEBIAN_FRONTEND=noninteractive

# Ensure /etc/apt/sources.list exists (for contrib/non-free fonts)
RUN echo "deb http://deb.debian.org/debian bookworm main contrib non-free" > /etc/apt/sources.list && \
    echo "deb http://security.debian.org/debian-security bookworm-security main contrib non-free" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bookworm-updates main contrib non-free" >> /etc/apt/sources.list

# Install LibreOffice, fonts, Java, and locales
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-java-common \
    default-jre \
    fonts-dejavu \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-freefont-ttf \
    cabextract \
    xfonts-utils \
    wget \
    locales && \
    rm -rf /var/lib/apt/lists/*

# Generate UTF-8 locale
RUN echo "en_US.UTF-8 UTF-8" > /etc/locale.gen && \
    locale-gen

ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# --- Install Microsoft TrueType fonts for consistent formatting ---
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

# Verify LibreOffice
RUN soffice --version

# Set working directory
WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

# Expose your app port
EXPOSE 10000

# Start the app
CMD ["node", "server.js"]
