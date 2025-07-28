# Deployment Guide: Mandanten Portal mit MongoDB

## Vorbereitung

### 1. MongoDB Setup

**Option A: Lokale MongoDB Installation**
```bash
# macOS mit Homebrew
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Verbindungsstring: mongodb://localhost:27017/mandanten-portal
```

**Option B: MongoDB Atlas (Cloud) - Empfohlen für Produktion**
1. Gehe zu https://cloud.mongodb.com
2. Erstelle kostenloses Cluster
3. Erstelle Database User
4. Whitelist IP-Adressen
5. Kopiere Connection String mongodb+srv://<db_username>:<db_password>@backoffice.t0t9u7e.mongodb.net/?retryWrites=true&w=majority&appName=Backoffice

### 2. Dependencies installieren

```bash
cd server
npm install
```

### 3. Umgebungsvariablen konfigurieren

```bash
# Kopiere .env.example zu .env
cp .env.example .env

# Bearbeite .env mit deinen Werten
nano .env
```

**Wichtige Werte in .env:**
```bash
# MongoDB (lokale Installation)
MONGODB_URI=mongodb://localhost:27017/mandanten-portal

# Oder MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mandanten-portal

# Zendesk Integration
ZENDESK_SUBDOMAIN=deine-subdomain
ZENDESK_EMAIL=api@deine-kanzlei.com
ZENDESK_TOKEN=dein-zendesk-token
ZENDESK_FIELD_AKTENZEICHEN=28985782473373

# Server
PORT=3001
```

## Lokaler Test

### 1. Server starten
```bash
cd server
npm run dev
```

**Erwartete Ausgabe:**
```
🔌 Connecting to MongoDB...
📍 MongoDB URI: mongodb://localhost:27017/mandanten-portal
✅ Connected to MongoDB successfully
🔄 Migrating in-memory data to MongoDB...
✅ Migrated client: 12345 (Max Mustermann)
🎉 Migration completed: 1 migrated, 0 skipped
🚀 Server running on http://localhost:3001
📁 Uploads directory: /path/to/uploads
💾 Database: MongoDB Connected
```

### 2. Frontend starten
```bash
# In neuem Terminal
cd src
npm start
```

### 3. Test der Funktionalität

**A) Portal Login testen:**
1. Gehe zu http://localhost:3000/login
2. Verwende Testdaten:
   - Email: max.mustermann@example.com
   - Aktenzeichen: MAND_2024_001

**B) Webhook testen:**
```bash
curl -X POST http://localhost:3001/api/zendesk-webhook/portal-link \
  -H "Content-Type: application/json" \
  -d '{
    "ticket": {
      "id": "12345",
      "subject": "Test Ticket",
      "requester": {
        "id": "67890",
        "name": "Test User",
        "email": "test@example.com",
        "aktenzeichen": "MAND_TEST_001"
      }
    }
  }'
```

## Produktions-Deployment

### 1. Server vorbereiten

**Ubuntu/Debian Server:**
```bash
# Node.js installieren
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 für Prozess-Management
sudo npm install -g pm2

# Nginx für Reverse Proxy
sudo apt install nginx
```

### 2. Code auf Server deployen

```bash
# Git Repository klonen
git clone <your-repo-url> /var/www/mandanten-portal
cd /var/www/mandanten-portal

# Dependencies installieren
cd server && npm install --production
cd ../src && npm install && npm run build
```

### 3. PM2 Konfiguration

**Erstelle ecosystem.config.js:**
```javascript
module.exports = {
  apps: [{
    name: 'mandanten-portal-server',
    script: './server/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
```

**Server starten:**
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Folge den Anweisungen
```

### 4. Nginx Konfiguration

**Erstelle /etc/nginx/sites-available/mandanten-portal:**
```nginx
server {
    listen 80;
    server_name portal.kanzlei.de;

    # Frontend (React Build)
    location / {
        root /var/www/mandanten-portal/build;
        try_files $uri $uri/ /index.html;
    }

    # API Proxy zum Backend
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Aktiviere die Konfiguration:**
```bash
sudo ln -s /etc/nginx/sites-available/mandanten-portal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL mit Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d portal.kanzlei.de
```

## Zendesk Integration Setup

### 1. Webhook in Zendesk erstellen

**URL:** `https://portal.kanzlei.de/api/zendesk-webhook/portal-link`

**JSON Body:**
```json
{
  "ticket": {
    "id": "{{ticket.id}}",
    "subject": "{{ticket.title}}",
    "external_id": "{{ticket.external_id}}",
    "requester": {
      "id": "{{ticket.requester.id}}",
      "name": "{{ticket.requester.name}}",
      "email": "{{ticket.requester.email}}",
      "phone": "{{ticket.requester.phone}}",
      "aktenzeichen": "{{ticket.requester.custom_field_aktenzeichen}}"
    }
  }
}
```

### 2. Trigger erstellen

**Bedingungen:**
- Ticket: Comment text → Contains → "Portal-Link"
- Current user: Role → Is → Agent

**Aktionen:**
- Call webhook: [Dein Webhook]
- Add tags: portal-link-sent, phase-onboarding

## Monitoring & Wartung

### 1. Log-Überwachung
```bash
# PM2 Logs
pm2 logs mandanten-portal-server

# MongoDB Logs (bei lokaler Installation)
tail -f /usr/local/var/log/mongodb/mongo.log

# Nginx Logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 2. Database Backup
```bash
# MongoDB Backup Script
mongodump --uri="mongodb://localhost:27017/mandanten-portal" --out=/backup/$(date +%Y%m%d_%H%M%S)
```

### 3. Health Checks
```bash
# API Health Check
curl http://localhost:3001/api/admin/test-zendesk

# Database Health
curl http://localhost:3001/api/health
```

## Troubleshooting

### MongoDB Verbindungsfehler
```bash
# Überprüfe MongoDB Status
sudo systemctl status mongod

# Überprüfe Verbindung
mongo --eval "db.adminCommand('ismaster')"
```

### Webhook funktioniert nicht
1. Überprüfe Server-Logs: `pm2 logs`
2. Teste Webhook-URL manuell
3. Überprüfe Zendesk Webhook-Logs
4. Überprüfe Firewall-Einstellungen

### Performance-Optimierung
1. MongoDB Indexe überprüfen
2. PM2 Cluster-Modus nutzen
3. Nginx Caching aktivieren
4. CDN für statische Assets

## Sicherheit

### 1. Firewall-Konfiguration
```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 2. MongoDB-Sicherheit
```bash
# MongoDB Auth aktivieren
sudo nano /etc/mongod.conf

# Füge hinzu:
security:
  authorization: enabled
```

### 3. Regelmäßige Updates
```bash
# System Updates
sudo apt update && sudo apt upgrade

# Node.js Dependencies
npm audit && npm audit fix
```