FROM node:18-slim
ENV DEBIAN_FRONTEND=noninteractive

# Enable contrib/non-free repos and install LibreOffice + fonts
RUN echo "deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    apt-get update && \
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
    ttf-mscorefonts-installer \
    fontconfig \
    locales \
    && rm -rf /var/lib/apt/lists/*

# Rebuild font cache and set locale
RUN fc-cache -fv && \
    locale-gen en_US.UTF-8 && \
    update-locale LANG=en_US.UTF-8

ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

# Verify LibreOffice install
RUN soffice --version

EXPOSE 10000
CMD ["node", "server.js"]
