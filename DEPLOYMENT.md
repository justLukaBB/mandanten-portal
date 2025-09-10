# Deployment Guide

## 🚀 Deployment Options

### Option 1: Traditional VPS Deployment

#### Requirements
- Ubuntu 20.04+ or similar Linux distribution
- Node.js 14+ installed
- MongoDB 4.4+ installed
- Nginx for reverse proxy
- PM2 for process management
- SSL certificate (Let's Encrypt recommended)

#### Steps

1. **Server Setup**
```bash
# Update system
sudo apt update && sudo apt upgrade

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx
```

2. **Deploy Application**
```bash
# Clone repository
git clone https://github.com/justLukaBB/mandanten-portal.git
cd mandanten-portal

# Install dependencies
npm install
cd server && npm install

# Build frontend
cd ..
npm run build

# Copy build to server directory
cp -r build/* server/public/
```

3. **Configure PM2**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'mandanten-portal',
    script: './server/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
```

4. **Configure Nginx**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

5. **Start Services**
```bash
# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Start application with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Option 2: Docker Deployment

1. **Create Dockerfile**
```dockerfile
# Frontend build stage
FROM node:18-alpine as frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Backend stage
FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --production
COPY server ./server
COPY --from=frontend-build /app/build ./server/public
EXPOSE 3001
CMD ["node", "server/server.js"]
```

2. **Create docker-compose.yml**
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/mandanten-portal
    depends_on:
      - mongo
    volumes:
      - ./uploads:/app/server/uploads

  mongo:
    image: mongo:6.0
    volumes:
      - mongo-data:/data/db
    ports:
      - "27017:27017"

volumes:
  mongo-data:
```

3. **Deploy with Docker**
```bash
docker-compose up -d
```

### Option 3: Cloud Platform Deployment

#### Heroku
```bash
# Create Heroku app
heroku create mandanten-portal

# Add MongoDB addon
heroku addons:create mongodb-atlas

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set ZENDESK_SUBDOMAIN=your-subdomain
# ... set other env variables

# Deploy
git push heroku main
```

#### Render.com
1. Connect GitHub repository
2. Configure build command: `npm install && npm run build`
3. Configure start command: `cd server && npm start`
4. Add environment variables in dashboard
5. Add MongoDB Atlas connection string

### Option 4: Kubernetes Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mandanten-portal
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mandanten-portal
  template:
    metadata:
      labels:
        app: mandanten-portal
    spec:
      containers:
      - name: app
        image: mandanten-portal:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: mandanten-secrets
              key: mongodb-uri
```

## 🔧 Production Configuration

### Environment Variables (Production)
```env
# Server
NODE_ENV=production
PORT=3001

# URLs
FRONTEND_URL=https://your-domain.com
BACKEND_URL=https://your-domain.com

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mandanten-portal?retryWrites=true&w=majority

# Security
SESSION_SECRET=your-very-long-random-string
JWT_SECRET=another-very-long-random-string

# Zendesk
ZENDESK_SUBDOMAIN=your-company
ZENDESK_EMAIL=integration@your-company.com
ZENDESK_API_TOKEN=your-production-token

# AI Services
OPENAI_API_KEY=your-production-key
ANTHROPIC_API_KEY=your-production-key

# Email (if using)
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-password
```

### SSL/TLS Setup

Using Let's Encrypt with Certbot:
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Monitoring Setup

1. **Application Monitoring (PM2)**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

2. **Server Monitoring**
```bash
# Install monitoring tools
sudo apt install htop iotop nethogs

# Setup log monitoring
sudo apt install logwatch
```

3. **Database Backup**
```bash
# Create backup script
#!/bin/bash
BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE"
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +
```

### Performance Optimization

1. **Enable Compression**
```javascript
// In server.js
const compression = require('compression');
app.use(compression());
```

2. **Static Asset Caching**
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

3. **Database Indexes**
```javascript
// Ensure indexes are created
db.clients.createIndex({ email: 1, aktenzeichen: 1 });
db.clients.createIndex({ current_status: 1 });
db.clients.createIndex({ created_at: -1 });
```

## 🚨 Production Checklist

- [ ] Set NODE_ENV=production
- [ ] Configure proper MongoDB connection with replica set
- [ ] Set up SSL certificates
- [ ] Configure firewall rules
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Set up monitoring and alerts
- [ ] Test disaster recovery procedure
- [ ] Document all configurations
- [ ] Set up CI/CD pipeline

## 📊 Recommended Specifications

### Minimum Requirements
- 2 CPU cores
- 4GB RAM
- 20GB SSD storage
- 100Mbps network

### Recommended for Production
- 4+ CPU cores
- 8GB+ RAM
- 50GB+ SSD storage
- 1Gbps network
- Load balancer for high availability
- MongoDB replica set
- Redis for caching (optional)

## 🔐 Security Hardening

1. **Firewall Configuration**
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

2. **Secure MongoDB**
```javascript
// Enable authentication
use admin
db.createUser({
  user: "adminUser",
  pwd: "strongPassword",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})
```

3. **Regular Updates**
```bash
# Create update script
#!/bin/bash
apt update
apt upgrade -y
npm audit fix
pm2 restart all
```

## 📞 Support

For deployment issues:
- Check logs: `pm2 logs`
- MongoDB logs: `sudo journalctl -u mongod`
- Nginx logs: `/var/log/nginx/error.log`