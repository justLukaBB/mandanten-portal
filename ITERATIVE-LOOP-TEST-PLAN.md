# 🧪 Iterative Loop - Test Plan

## 📋 Übersicht
Dieser Testplan deckt alle Szenarien für den neuen iterativen Dokumenten-Upload Loop ab.

---

## ✅ FIXES DURCHGEFÜHRT

### Fix 1: Status-Reihenfolge in portal-webhooks.js
**Problem:** Status wurde überschrieben BEVOR die Confirmation-Phase-Prüfung durchgeführt wurde
**Lösung:** `isInConfirmationPhase` wird nun VOR der Status-Änderung geprüft
**Status:** ✅ BEHOBEN

---

## 🧪 TEST-SZENARIEN

### **Szenario 1: Initial Document Upload (Happy Path)**
**Beschreibung:** User lädt Dokumente zum ersten Mal hoch

**Steps:**
1. User ist im Status `created`
2. User lädt 3 Dokumente hoch
3. System sollte:
   - Status → `documents_uploaded`
   - Status → `documents_processing`
   - Dokumente werden verarbeitet
   - `review_iteration_count` bleibt bei 0

**Expected Result:**
- ✅ Status: `documents_processing`
- ✅ `isInConfirmationPhase`: `false`
- ✅ Kein Zendesk Ticket für "additional documents"

---

### **Szenario 2: Additional Documents During Confirmation (Iterative Loop)**
**Beschreibung:** User lädt zusätzliche Dokumente während Gläubiger-Bestätigung hoch

**Initial State:**
- Status: `awaiting_client_confirmation`
- `admin_approved`: `true`
- `review_iteration_count`: `1`
- Existing creditors: 5

**Steps:**
1. User lädt 2 zusätzliche Dokumente hoch
2. System sollte:
   - ✅ `isInConfirmationPhase`: `true`
   - ✅ Status bleibt NICHT `documents_processing`
   - ✅ Status → `additional_documents_review`
   - ✅ `additional_documents_uploaded_after_review`: `true`
   - ✅ Zendesk Ticket wird erstellt
   - ✅ Ticket enthält: iteration count, existing creditors count

**Expected Result:**
- Status: `additional_documents_review`
- Zendesk Ticket erstellt: ✅
- Agent bekommt Notification: ✅

---

### **Szenario 3: Agent Reviews Additional Documents**
**Beschreibung:** Agent reviewed die zusätzlichen Dokumente

**Initial State:**
- Status: `additional_documents_review`
- `review_iteration_count`: `1`
- `additional_documents_uploaded_after_review`: `true`
- Existing creditors: 5
- New documents: 2

**Steps:**
1. Agent öffnet Agent Portal
2. Agent sieht neue Dokumente zur Review
3. Agent bestätigt/korrigiert Gläubiger
4. Agent klickt "Complete Review"
5. System sollte:
   - ✅ `review_iteration_count` → `2`
   - ✅ `additional_documents_uploaded_after_review` → `false`
   - ✅ Status → `awaiting_client_confirmation`
   - ✅ Email an Client mit "Version 2"
   - ✅ Email enthält Hinweis auf weitere Uploads

**Expected Result:**
- Status: `awaiting_client_confirmation`
- `review_iteration_count`: `2`
- Email Text: "zusätzlich eingereichten" + "(Aktualisiert - Version 2)"

---

### **Szenario 4: Multiple Iterations (Loop 3x)**
**Beschreibung:** User lädt 3x zusätzliche Dokumente hoch

**Iteration Flow:**
```
Initial: count=0 → Agent Review → count=1
Loop 1:  count=1 → User uploads → Agent Review → count=2
Loop 2:  count=2 → User uploads → Agent Review → count=3
Loop 3:  count=3 → User uploads → Agent Review → count=4
Final:   User confirms → Creditor Contact starts
```

**Expected Results:**
- ✅ Each iteration creates Zendesk ticket
- ✅ Each email shows correct version number
- ✅ All creditors are accumulated (not overwritten)
- ✅ No data loss between iterations

---

### **Szenario 5: Edge Case - Upload During Wrong Status**
**Beschreibung:** User versucht Upload während `completed` Status

**Initial State:**
- Status: `completed`
- Process finished

**Steps:**
1. User versucht Dokumente hochzuladen
2. Frontend sollte:
   - ❌ Upload-Komponente verstecken
   - ✅ Zeige "Prozess abgeschlossen"

**Expected Result:**
- Upload wird nicht erlaubt (Frontend verhindert)

---

### **Szenario 6: Edge Case - No Documents Uploaded**
**Beschreibung:** Webhook wird getriggert aber documentsCount = 0

**Initial State:**
- Status: `awaiting_client_confirmation`
- documentsCount: 0

**Steps:**
1. Webhook wird aufgerufen mit 0 Dokumenten
2. System sollte:
   - ✅ `isInConfirmationPhase && documentsCount > 0` → `false`
   - ✅ Kein Zendesk Ticket erstellt
   - ✅ Keine Status-Änderung

**Expected Result:**
- Kein Fehler
- Keine Aktion durchgeführt

---

### **Szenario 7: Edge Case - First Review (count undefined)**
**Beschreibung:** Alte Clients ohne review_iteration_count Feld

**Initial State:**
- `review_iteration_count`: `undefined`

**Steps:**
1. Agent completed Review
2. System sollte:
   - ✅ Prüfung: `if (client.review_iteration_count === undefined)`
   - ✅ Setzt auf `0`
   - ✅ Erhöht auf `1`

**Expected Result:**
- `review_iteration_count`: `1`
- Kein Error wegen undefined

---

### **Szenario 8: Frontend - Upload Bleibt Aktiv**
**Beschreibung:** Upload-Komponente bleibt während Confirmation sichtbar

**Initial State:**
- Status: `awaiting_client_confirmation`
- `showingCreditorConfirmation`: `true`

**Frontend Check:**
1. ✅ Upload-Komponente ist sichtbar (nicht geblurred)
2. ✅ Info-Banner zeigt Hinweis
3. ✅ User kann Dateien hochladen
4. ✅ Button "Weitere Dokumente hochladen" funktioniert

**Expected Result:**
- Upload funktioniert
- Keine Fehlermeldungen
- Info-Banner erklärt den Prozess

---

### **Szenario 9: Frontend - Creditor Confirmation Button**
**Beschreibung:** Neuer "Weitere Dokumente hochladen" Button

**Steps:**
1. User sieht Gläubigerliste
2. User klickt "Weitere Dokumente hochladen"
3. System sollte:
   - ✅ Scroll zu Upload-Komponente (top)
   - ✅ Upload-Komponente ist fokussiert

**Expected Result:**
- Smooth scroll nach oben
- User kann sofort Dateien auswählen

---

## 🔍 KRITISCHE PRÜFUNGEN

### ✅ 1. Status-Reihenfolge (BEHOBEN)
- Prüfung MUSS vor Status-Änderung erfolgen
- `isInConfirmationPhase` wird zuerst berechnet

### ✅ 2. Zendesk Ticket Creation
- Ticket wird NUR bei `isInConfirmationPhase === true` erstellt
- Ticket enthält alle relevanten Daten

### ✅ 3. Iteration Counter
- Wird korrekt initialisiert (0 bei undefined)
- Wird bei jedem Review +1 erhöht
- Reset Flag wird korrekt gesetzt

### ✅ 4. Email Versionierung
- Email Text ändert sich ab Version 2
- Version-Nummer wird korrekt angezeigt

### ✅ 5. Frontend Upload
- Bleibt aktiv während Confirmation
- Keine pointer-events: none
- Keine blur

---

## 🚀 DEPLOYMENT CHECKLIST

Vor dem Deployment prüfen:

- [ ] ✅ Backend Syntax OK (node -c)
- [ ] ✅ Status-Reihenfolge korrekt
- [ ] ✅ Zendesk Service verfügbar
- [ ] ✅ Environment Variables gesetzt (FRONTEND_URL)
- [ ] ✅ MongoDB Schema akzeptiert neue Felder
- [ ] ✅ Frontend kompiliert ohne TypeScript Fehler
- [ ] ⚠️ Test in Development Environment
- [ ] ⚠️ Monitor erste Production Uploads

---

## 📊 ERWARTETE LOGS

### Bei Additional Document Upload:
```
📄 Additional documents uploaded during confirmation phase for AZ-12345
✅ New review ticket created for additional documents: 67890
```

### Bei Agent Review Completion:
```
🔄 Completed review iteration 2 for AZ-12345 (additional documents processed)
📧 Sending client notification to user@example.com...
```

### Bei Frontend Upload:
```
🔍 Should show creditor confirmation: true
💡 Info-Banner wird angezeigt
```

---

## ⚠️ BEKANNTE LIMITIERUNGEN

1. **Keine Limit für Iterationen**
   - User kann theoretisch unendlich oft Dokumente hochladen
   - Lösung: Eventuell nach 5 Iterationen Agent manuell eingreifen lassen

2. **Zendesk Ticket Spam**
   - Bei jedem Upload wird neues Ticket erstellt
   - Lösung: Tickets werden mit Tags gruppiert

3. **Email Überflutung**
   - Client bekommt bei jeder Iteration eine Email
   - Lösung: In Email steht klarer Hinweis

---

## ✅ ABSCHLUSS

**Status:** Alle kritischen Bugs behoben ✅
**Bereit für Testing:** JA ✅
**Bereit für Production:** Nach Development Testing ⚠️
