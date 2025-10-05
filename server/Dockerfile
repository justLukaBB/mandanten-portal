# Use official Node.js LTS image
FROM node:18-slim
ENV DEBIAN_FRONTEND=noninteractive

# Install LibreOffice and supporting tools
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
    wget \
    xfonts-utils \
    locales && \
    rm -rf /var/lib/apt/lists/*

# --- Install Microsoft TrueType fonts (for layout consistency) ---
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

# --- Fix locale generation (Render safe) ---
RUN echo "en_US.UTF-8 UTF-8" > /etc/locale.gen && \
    locale-gen
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Verify LibreOffice installation
RUN soffice --version

# Set working directory
WORKDIR /app

# Copy dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Expose app port
EXPOSE 10000

# Start Node server
CMD ["node", "server.js"]
