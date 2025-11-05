# Aktenzeichen in URLs - Best Practices

## Problem

Aktenzeichen können Sonderzeichen wie `/`, `\`, oder Leerzeichen enthalten (z.B. `537/000`). Diese Zeichen sind in URLs problematisch:

- **URL-Routing:** `/api/clients/537/000` wird als zwei URL-Segmente interpretiert (`537` und `000`)
- **Resultat:** `Cannot GET /api/clients/537/000` Fehler

## Lösung

### ✅ **Empfohlen: UUID verwenden**

Verwende immer die **Client-UUID** statt des Aktenzeichens für API-Calls:

```javascript
// ✅ RICHTIG - UUID verwenden
const clientId = "653442b8-9cc6-432c-af2a-d725e26ecc5e";
fetch(`/api/clients/${clientId}`);
```

### ⚠️ **Wenn Aktenzeichen verwendet werden muss: URL-Encoding**

Falls das Aktenzeichen in URLs verwendet werden muss, **IMMER** URL-encodieren:

```javascript
// ❌ FALSCH - Aktenzeichen ohne Encoding
const aktenzeichen = "537/000";
fetch(`/api/clients/${aktenzeichen}`); // FEHLER!

// ✅ RICHTIG - Mit URL-Encoding
const aktenzeichen = "537/000";
const encoded = encodeURIComponent(aktenzeichen); // "537%2F000"
fetch(`/api/clients/${encoded}`);
```

## API-Verhalten

Die API-Endpunkte mit `:clientId` Parameter akzeptieren **beides**:

1. **UUID** (empfohlen): `653442b8-9cc6-432c-af2a-d725e26ecc5e`
2. **Aktenzeichen** (muss URL-encoded sein): `537%2F000`

### Backend-Logik (server.js)

```javascript
async function getClient(clientId) {
  // Sucht zuerst nach UUID
  let client = await Client.findOne({ id: clientId });

  // Falls nicht gefunden, sucht nach Aktenzeichen
  if (!client) {
    client = await Client.findOne({ aktenzeichen: clientId });
  }

  return client;
}
```

## Validierung

### Aktenzeichen-Format

Erlaubte Zeichen: `A-Z`, `a-z`, `0-9`, `_`, `-`

```javascript
// ✅ Gültig
"CASE123"
"TEST_CC_1730000000"
"AZ-2024-001"

// ❌ Ungültig (ohne URL-encoding)
"537/000"      // Enthält /
"CASE\\123"    // Enthält \
"CASE 123"     // Enthält Leerzeichen
```

### URL-Validierung

Die neue Middleware `validateClientIdParam` validiert automatisch:

```javascript
const { validateClientIdParam } = require('./utils/sanitizeAktenzeichen');

app.get('/api/clients/:clientId', validateClientIdParam, async (req, res) => {
  // clientId ist validiert
  // req.clientIdType ist entweder 'uuid' oder 'aktenzeichen'
});
```

## Fehlerbehandlung

### Fehler: `Cannot GET /api/clients/537/000`

**Ursache:** Aktenzeichen mit `/` wurde nicht URL-encoded

**Lösung:**
```javascript
// Frontend/Client-Code anpassen:
const aktenzeichen = "537/000";
const url = `/api/clients/${encodeURIComponent(aktenzeichen)}`;
// Resultat: /api/clients/537%2F000 ✅
```

### Fehler: `Invalid clientId format`

**Ursache:** Aktenzeichen enthält nach URL-Decoding noch ungültige Zeichen

**Lösung:** Aktenzeichen in der Datenbank bereinigen oder nur UUIDs verwenden

## Frontend-Integration

### React/JavaScript Beispiel

```javascript
// Helper-Funktion für sichere Client-URLs
function getClientUrl(client) {
  // Bevorzuge UUID
  if (client.id) {
    return `/api/clients/${client.id}`;
  }

  // Falls nur Aktenzeichen verfügbar, URL-encode
  if (client.aktenzeichen) {
    return `/api/clients/${encodeURIComponent(client.aktenzeichen)}`;
  }

  throw new Error('Client hat weder ID noch Aktenzeichen');
}

// Verwendung
const client = { id: "653442b8...", aktenzeichen: "537/000" };
fetch(getClientUrl(client)); // Verwendet UUID
```

### Axios Beispiel

```javascript
import axios from 'axios';

// Axios encoded automatisch - ABER nur wenn man params verwendet
// ❌ FALSCH
axios.get(`/api/clients/${aktenzeichen}`);

// ✅ RICHTIG
axios.get(`/api/clients/${encodeURIComponent(aktenzeichen)}`);
```

## Datenbank-Migration

Falls bestehende Clients ungültige Aktenzeichen haben, können diese bereinigt werden:

```javascript
const { sanitizeAktenzeichen } = require('./server/utils/sanitizeAktenzeichen');

async function migrateAktenzeichen() {
  const clients = await Client.find({});

  for (const client of clients) {
    try {
      const sanitized = sanitizeAktenzeichen(client.aktenzeichen);

      if (sanitized !== client.aktenzeichen) {
        console.log(`Updating: ${client.aktenzeichen} → ${sanitized}`);
        client.aktenzeichen = sanitized;
        await client.save();
      }
    } catch (error) {
      console.error(`Invalid aktenzeichen for client ${client.id}:`, error.message);
    }
  }
}
```

## Zusammenfassung

### ✅ DO's

1. **Verwende UUIDs** für API-Calls
2. **URL-encode** Aktenzeichen wenn nötig: `encodeURIComponent()`
3. **Validiere** Input mit den bereitgestellten Utilities
4. **Teste** mit Sonderzeichen: `/`, `\`, Leerzeichen

### ❌ DON'Ts

1. ❌ Aktenzeichen mit `/` ohne URL-Encoding in URLs verwenden
2. ❌ Annehmen dass Aktenzeichen URL-safe sind
3. ❌ Manuelles String-Concatenation für URLs
4. ❌ Aktenzeichen als Route-Parameter ohne Validierung

## Betroffene API-Endpunkte

Alle Endpunkte mit `:clientId` Parameter:

- `GET /api/clients/:clientId`
- `POST /api/clients/:clientId/documents`
- `GET /api/clients/:clientId/documents/:documentId/download`
- `POST /api/clients/:clientId/confirm-creditors`
- `POST /api/clients/:clientId/financial-data`
- ... und viele weitere (siehe server.js)

## Support

Bei Fragen oder Problemen:

1. Überprüfe ob URL-Encoding verwendet wird
2. Überprüfe das Aktenzeichen-Format in der Datenbank
3. Teste mit der UUID statt Aktenzeichen
4. Verwende `test-aktenzeichen-sanitization.js` für Unit-Tests
