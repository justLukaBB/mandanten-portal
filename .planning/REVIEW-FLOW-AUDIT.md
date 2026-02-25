# Review Flow — Bug-Audit

> **Stand:** 2026-02-24
> **Betrifft:** Gesamter Review-Flow von Queue bis Success
> **Dateien:** `review-action-bar.tsx`, `review-workspace-page.tsx`, `review-summary-dialog.tsx`, `review-final-view.tsx`, `review-success-view.tsx`, `reviewUiSlice.ts`, `reviewApi.ts`, `agentReviewController.js`

---

## Übersicht: Datenfluss

```
User klickt Button (ActionBar)
    |
    v
saveCorrection API  ─────────────>  Server: creditor wird aktualisiert
    |                                  (confirm: status='confirmed', needs_manual_review=false)
    |                                  (correct: felder werden überschrieben)
    |                                  (skip: creditor wird aus Array GELÖSCHT)
    |
    v
dispatch(recordReviewAction)  ────>  Redux: reviewActions[creditorId] = { action, corrections?, skipReason? }
    |
    v
onActionComplete(action)  ────────>  Workspace: handleActionComplete
    |                                  |
    |                                  v
    |                              dispatch(recordReviewAction)  ⚠️ ZWEITES MAL (überschreibt!)
    |                                  |
    |                                  v
    |                              if (isLastCreditor) → setViewPhase('final')
    |                              else → setCurrentCreditorIndex(index + 1)
```

---

## 🔴 BUG 1: Doppeltes `recordReviewAction` — Korrekturen gehen verloren

**Schwere: KRITISCH**
**Dateien:** `review-action-bar.tsx:149/169/187`, `review-workspace-page.tsx:377-378`

### Problem

`recordReviewAction` wird ZWEIMAL dispatched — einmal in der ActionBar, einmal im Workspace.
Die ActionBar schickt corrections/skipReason mit, der Workspace überschreibt dann OHNE diese Daten:

```
ActionBar:   dispatch({ creditorId, action: 'correct', corrections: { claim_amount: '5000' } })
Workspace:   dispatch({ creditorId, action: 'correct' })   ← ÜBERSCHREIBT! corrections = undefined
```

### Auswirkung

- `reviewActions[creditorId].corrections` ist IMMER `undefined`
- `getEffectiveAmount()` findet keine korrigierten Beträge → zeigt Original-Wert
- Final View / Summary zeigen immer die API-Original-Beträge, nie die Korrekturen
- `skipReason` geht ebenfalls verloren

### Fix

`handleActionComplete` im Workspace sollte `recordReviewAction` NICHT mehr dispatchen — das macht bereits die ActionBar:

```typescript
// review-workspace-page.tsx — handleActionComplete
const handleActionComplete = useCallback((action: ReviewAction) => {
    // ENTFERNT: dispatch(recordReviewAction(...)) — macht bereits ActionBar
    completedTimesRef.current.push(timerSecondsRef.current);

    if (isLastCreditor) {
        setViewPhase('final');
    } else {
        dispatch(setCurrentCreditorIndex(currentCreditorIndex + 1));
    }
}, [dispatch, isLastCreditor, currentCreditorIndex]);
```

---

## 🔴 BUG 2: "Bestätigen" verwirft ungespeicherte Formular-Änderungen

**Schwere: HOCH**
**Datei:** `review-action-bar.tsx:139-153`

### Problem

Wenn der User ein Feld ändert (z.B. `claim_amount` von 0 auf 5000) und dann den grünen "Bestätigen"-Button drückt:

1. API bekommt `action: 'confirm'` — **OHNE corrections**
2. Server setzt `confidence: 1.0`, `status: 'confirmed'` auf den **Original-Daten**
3. Die Änderung im Formular geht **komplett verloren**

### Aktueller Schutz

- Opacity 0.4 auf dem grünen Button wenn `correctionCount > 0` (visueller Hint)
- **Kein harter Schutz** — User kann trotzdem klicken

### Empfohlener Fix

Option A: Wenn corrections vorhanden sind, `handleConfirm` automatisch `handleCorrect` aufrufen:

```typescript
const handleConfirm = async () => {
    if (correctionCount > 0) {
        // User hat Felder geändert — automatisch als Korrektur senden
        return handleCorrect();
    }
    // ... normaler confirm-Flow
};
```

Option B: Button komplett disabled wenn `correctionCount > 0`.

---

## 🟡 BUG 3: Skip löscht Gläubiger server-seitig — Index-Drift

**Schwere: MITTEL**
**Datei:** `agentReviewController.js:1026-1028`

### Problem

Server-Code bei `action === 'skip'`:
```javascript
// Remove creditor from list when skipped
creditors.splice(creditorIndex, 1);
```

Der Gläubiger wird komplett aus dem Array entfernt. Falls irgendwann ein Data-Refetch passiert (RTK Query refetchOnFocus, manueller Refresh, etc.):

- `needing_review_with_docs` ist kürzer als erwartet
- `currentCreditorIndex` zeigt auf den falschen Gläubiger oder ist out-of-bounds
- User reviewed ggf. den **falschen Gläubiger** ohne es zu merken

### Aktueller Schutz

- `invalidatesTags` aus `saveReviewCorrection` wurde entfernt → kein automatischer Refetch
- Aber: Browser-Refresh, Tab-Wechsel (refetchOnFocus), oder manuelles `refetch()` könnten es trotzdem triggern

### Empfohlener Fix

Bounds-Check im Workspace nach jedem `data`-Update:

```typescript
useEffect(() => {
    if (currentCreditorIndex >= activeCreditorList.length && activeCreditorList.length > 0) {
        dispatch(setCurrentCreditorIndex(activeCreditorList.length - 1));
    }
}, [activeCreditorList.length, currentCreditorIndex, dispatch]);
```

---

## 🟡 BUG 4: Falscher Gläubiger nach Refetch (needing_review schrumpft)

**Schwere: MITTEL**
**Datei:** `review-workspace-page.tsx:359-364`

### Problem

```typescript
const activeCreditorList = useMemo(() => {
    const cr = data.creditors.needing_review_with_docs;   // Schrumpft nach confirm
    const all = data.creditors.with_documents;             // Bleibt gleich
    return cr.length > 0 ? cr : all;
}, [data]);
```

Nach einem Refetch:
- `needing_review_with_docs` hat weniger Items (confirmed creditors rausgefiltert)
- Aber `currentCreditorIndex` wurde bereits erhöht
- Ergebnis: **Index zeigt auf falschen Gläubiger** oder ist out-of-bounds

### Beispiel

```
Vorher:  [A, B, C] (3 items needing review)  — Index = 1 (zeigt B)
User bestätigt B
Refetch: [A, C] (2 items needing review)     — Index = 2 (OUT OF BOUNDS!)
  oder:  Index = 1 → zeigt C statt den nächsten ungeprüften
```

### Aktueller Schutz

- `invalidatesTags` entfernt → kein automatischer Refetch nach saveCorrection
- Aber Tab-Wechsel, manueller Refresh etc. können Refetch triggern

### Langfristiger Fix

Die Workspace-Liste sollte beim Laden einmalig als Snapshot gespeichert werden (z.B. in einem `useRef`), nicht reaktiv vom RTK Query Cache abhängen. Oder: immer `with_documents` verwenden (das ändert sich nicht durch confirms).

---

## 🟡 BUG 5: Keyboard-Shortcut `data-action` fehlt auf blauem Button

**Schwere: NIEDRIG**
**Datei:** `review-action-bar.tsx:380`, `review-workspace-page.tsx:455-458`

### Problem

```typescript
// Workspace: Shortcut-Handler sucht per DOM-Query
onCorrect: () => {
    const correctBtn = document.querySelector('[data-action="correct"]') as HTMLButtonElement;
    if (correctBtn) correctBtn.click();
},
```

Aber der blaue "Korrigieren"-Button hat **kein** `data-action="correct"` Attribut → Ctrl+S Shortcut tut nichts.

### Fix

`data-action="correct"` zum blauen Button hinzufügen. Gleiches für Skip-Button (`data-action="skip"`).

---

## 🟢 Korrekte Flows (kein Bug gefunden)

| Flow | Status | Anmerkung |
|------|--------|-----------|
| Dot-Click → springt zum Gläubiger | ✅ OK | Setzt viewPhase auf 'review' und Index korrekt |
| Zusammenfassung-Modal → Klick auf Gläubiger | ✅ OK | Schließt Modal, setzt Index |
| Final View → "Zurück zum Review" | ✅ OK | Setzt viewPhase auf 'review', letzter Index bleibt |
| Final View → Confirmation → API → Success | ✅ OK | State-Transitions korrekt |
| Success → "Nächster Fall" | ✅ OK | Fetcht Queue, navigiert oder zeigt Toast |
| Success → "Zurück zur Queue" | ✅ OK | resetReviewState + navigate |
| Timer stoppt bei Final/Success | ✅ OK | `useTimer(key, paused)` mit `viewPhase !== 'review'` |
| Keyboard Shortcuts disabled in Final/Success | ✅ OK | Condition: `viewPhase === 'review' && !showSummary && !showShortcuts` |

---

## Zusammenfassung — Priorität

| # | Bug | Schwere | Fix-Aufwand |
|---|-----|---------|-------------|
| 1 | Doppeltes `recordReviewAction` löscht corrections | 🔴 KRITISCH | 1 Zeile entfernen |
| 2 | "Bestätigen" verwirft Formular-Änderungen still | 🔴 HOCH | ~5 Zeilen |
| 3 | Skip löscht Gläubiger server-seitig → Index-Drift | 🟡 MITTEL | Bounds-Check |
| 4 | Refetch schrumpft needing_review → falscher Index | 🟡 MITTEL | Bounds-Check / Snapshot |
| 5 | `data-action="correct"` fehlt auf blauem Button | 🟡 NIEDRIG | 1 Attribut |
