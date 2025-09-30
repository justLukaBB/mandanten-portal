# Use official Node.js LTS image
FROM node:18-slim

# Install LibreOffice for DOCX to PDF conversion
RUN apt-get update && \
    apt-get install -y \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy application code
COPY . .

# Expose port
EXPOSE 10000

# Start the application
CMD ["node", "server.js"]
