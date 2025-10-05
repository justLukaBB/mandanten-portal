FROM node:18-slim
ENV DEBIAN_FRONTEND=noninteractive

# Ensure apt sources exist (node:slim may lack /etc/apt/sources.list)
RUN echo "deb http://deb.debian.org/debian bookworm main contrib non-free" > /etc/apt/sources.list && \
    echo "deb http://security.debian.org/debian-security bookworm-security main contrib non-free" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bookworm-updates main contrib non-free" >> /etc/apt/sources.list

# Install LibreOffice, fonts, and locale packages
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
    default-jre && \
    rm -rf /var/lib/apt/lists/*

# Generate UTF-8 locale
RUN echo "en_US.UTF-8 UTF-8" > /etc/locale.gen && \
    locale-gen
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Rebuild font cache
RUN fc-cache -fv

# Verify LibreOffice install
RUN soffice --version

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 10000
CMD ["node", "server.js"]
