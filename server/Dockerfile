FROM node:18-slim
ENV DEBIAN_FRONTEND=noninteractive

# Add contrib + non-free repositories (for msttcorefonts)
RUN sed -i 's/main/main contrib non-free/' /etc/apt/sources.list

# Install LibreOffice, Java, fonts, and locales
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
    ttf-mscorefonts-installer \
    locales && \
    rm -rf /var/lib/apt/lists/*

# Generate and set UTF-8 locale
RUN echo "en_US.UTF-8 UTF-8" > /etc/locale.gen && \
    locale-gen
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Rebuild font cache
RUN fc-cache -fv

# Verify LibreOffice
RUN soffice --version

WORKDIR /app

# Copy dependency files and install production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the app
COPY . .

EXPOSE 10000
CMD ["node", "server.js"]
