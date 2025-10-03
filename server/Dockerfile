# Use official Node.js LTS slim image
FROM node:18-slim

# Install LibreOffice + common fonts + locales
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    fonts-dejavu \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-freefont-ttf \
    ttf-mscorefonts-installer \
    locales \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Setup locales
RUN sed -i 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

# Verify LibreOffice installation
RUN which soffice && soffice --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy application code
COPY . .

# Expose port (Render usually uses $PORT, so let’s respect that)
EXPOSE 10000
ENV PORT=10000

# Start the application
CMD ["node", "server.js"]
