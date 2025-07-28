# 🔧 Google Document AI Setup Anleitung

## Schritt 1: Google Cloud Projekt erstellen

1. **Gehe zu [Google Cloud Console](https://console.cloud.google.com/)**
2. **Neues Projekt erstellen:**
   - Klick auf "Projekt auswählen" oben
   - Klick "NEUES PROJEKT"
   - Projektname: `mandanten-portal-ai`
   - Klick "ERSTELLEN"

## Schritt 2: Document AI API aktivieren

1. **API aktivieren:**
   - Gehe zu "APIs & Services" > "Bibliothek"
   - Suche nach "Document AI API"
   - Klick auf "Document AI API"
   - Klick "AKTIVIEREN"

2. **Billing Account einrichten:**
   - Gehe zu "Billing" 
   - Verknüpfe eine Zahlungsmethode (kostenloses Kontingent verfügbar)

## Schritt 3: Document AI Processor erstellen

1. **Document AI Console öffnen:**
   - Gehe zu [Document AI Console](https://console.cloud.google.com/ai/document-ai)

2. **Processor erstellen:**
   - Klick "CREATE PROCESSOR"
   - Processor Type: **"Document OCR"** (für allgemeine Texterkennung)
   - Processor Name: `creditor-document-processor`
   - Region: **"eu"** (Europa) für DSGVO-Compliance
   - Klick "CREATE"

3. **Processor ID notieren:**
   - Nach Erstellung wird eine Processor ID angezeigt (z.B. `abc123def456`)
   - Diese ID brauchen wir später!

## Schritt 4: Service Account erstellen

1. **Service Account erstellen:**
   - Gehe zu "IAM & Admin" > "Service Accounts"
   - Klick "CREATE SERVICE ACCOUNT"
   - Name: `document-ai-service`
   - Description: `Service account for Document AI processing`
   - Klick "CREATE AND CONTINUE"

2. **Berechtigungen zuweisen:**
   - Role hinzufügen: **"Document AI API User"**
   - Klick "CONTINUE"
   - Klick "DONE"

3. **Service Account Key erstellen:**
   - Klick auf den erstellten Service Account
   - Gehe zu "KEYS" Tab
   - Klick "ADD KEY" > "Create new key"
   - Type: **JSON**
   - Klick "CREATE"
   - **Datei wird heruntergeladen** → Speichere sie als `service-account-key.json`

## Schritt 5: Lokale Konfiguration

1. **Service Account Key verschieben:**
   ```bash
   # Verschiebe die heruntergeladene Datei in dein Projekt
   mv ~/Downloads/mandanten-portal-ai-*.json /Users/luka/Mandanten-Portal/server/service-account-key.json
   ```

2. **Environment Variablen konfigurieren:**
   
   Öffne `/Users/luka/Mandanten-Portal/server/.env` und ersetze:
   
   ```bash
   # Google Cloud Document AI Configuration
   GOOGLE_CLOUD_PROJECT_ID=mandanten-portal-ai
   GOOGLE_CLOUD_LOCATION=eu
   GOOGLE_DOCUMENT_AI_PROCESSOR_ID=abc123def456  # Deine Processor ID hier
   GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
   ```

## Schritt 6: Abhängigkeiten installieren

```bash
cd /Users/luka/Mandanten-Portal/server
npm install
```

## Schritt 7: Testen

1. **Server starten:**
   ```bash
   cd /Users/luka/Mandanten-Portal/server
   node server.js
   ```

2. **Frontend starten:**
   ```bash
   cd /Users/luka/Mandanten-Portal
   npm start
   ```

3. **Dokument hochladen und testen**

## 📋 Wichtige Informationen

### **Kosten:**
- **Kostenloses Kontingent:** 1.000 Seiten pro Monat
- **Danach:** ~$1.50 pro 1.000 Seiten
- **Für deine Nutzung:** Sehr günstig!

### **DSGVO-Compliance:**
- **Region "eu" verwenden** für EU-Datenschutz
- **Daten verlassen nicht die EU**
- **Google's DSGVO-konforme Verarbeitung**

### **Vorteile gegenüber OpenAI:**
- ✅ **Bessere OCR** für gescannte Dokumente
- ✅ **DSGVO-konform** in EU-Region
- ✅ **Günstiger** für Dokumente
- ✅ **Speziell für Dokumentenverarbeitung**
- ✅ **Keine Token-Limits**

### **Debugging:**
```bash
# Logs anschauen
tail -f /Users/luka/Mandanten-Portal/server/server.log

# Test Document AI direkt
curl -X POST http://localhost:3001/api/clients/12345/documents \
  -F "documents=@test-document.pdf"
```

## 🔧 Fehlerbehebung

**Fehler: "Permission denied"**
→ Service Account Berechtigungen prüfen

**Fehler: "Project not found"**
→ Project ID in .env prüfen

**Fehler: "Processor not found"**
→ Processor ID und Region prüfen

**Fehler: "Billing not enabled"**
→ Billing Account verknüpfen in Google Cloud Console

---

Nach dem Setup hast du ein professionelles AI-System für deutsche Gläubigerdokumente! 🚀