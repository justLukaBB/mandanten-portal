# Git Workflow Guide

## Standard Workflow für neue Features/Fixes

### 1. Sicherstellen, dass du auf dem neuesten Stand bist
```bash
git checkout main
git pull
```

### 2. Neuen Branch erstellen
```bash
git checkout -b branch-name
```
**Naming Convention:**
- Features: `feature-description` (z.B. `new-data-client-creation`)
- Fixes: `fix-description` (z.B. `fix-new-fields-webhook`)
- Updates: `update-description` (z.B. `update-email-templates`)

### 3. Änderungen vornehmen
- Code bearbeiten
- Tests durchführen
- Sicherstellen, dass alles funktioniert

### 4. Änderungen stagen
```bash
git add .
```
oder für spezifische Dateien:
```bash
git add path/to/file1 path/to/file2
```

### 5. Status prüfen (optional)
```bash
git status
```

### 6. Commit erstellen
```bash
git commit -m "Beschreibende Commit-Nachricht"
```
**Commit Message Guidelines:**
- Verwende Präsens: "Add" nicht "Added"
- Sei präzise: "Fix webhook to capture address fields" nicht "Fix bug"
- Halte es kurz aber aussagekräftig

### 7. Branch pushen
```bash
git push --set-upstream origin branch-name
```
oder kurz:
```bash
git push -u origin branch-name
```

### 8. Zurück zum main Branch
```bash
git checkout main
git pull
```

## Nach dem Merge (wenn PR gemerged wurde)

### 1. Main Branch aktualisieren
```bash
git checkout main
git pull
```

### 2. Lokalen Branch löschen (optional)
```bash
git branch -d branch-name
```

## Nützliche Befehle

### Aktuelle Branches anzeigen
```bash
git branch
```

### Remote Branches anzeigen
```bash
git branch -r
```

### Letzte Commits anzeigen
```bash
git log --oneline -5
```

### Änderungen verwerfen (vor git add)
```bash
git checkout -- path/to/file
```

### Letzten Commit rückgängig machen (lokal)
```bash
git reset --soft HEAD~1
```

## Wichtige Regeln

1. **Niemals direkt auf main pushen** - Immer einen Branch erstellen
2. **Pull vor Push** - Stelle sicher, dass du die neuesten Änderungen hast
3. **Ein Branch pro Feature/Fix** - Mische keine verschiedenen Änderungen
4. **Teste vor dem Commit** - Stelle sicher, dass dein Code funktioniert
5. **Aussagekräftige Commit-Messages** - Andere sollen verstehen, was geändert wurde

## Beispiel-Workflow

```bash
# 1. Auf neuesten Stand bringen
git checkout main
git pull

# 2. Feature-Branch erstellen
git checkout -b add-user-validation

# 3. Code ändern...
# 4. Änderungen hinzufügen
git add .

# 5. Committen
git commit -m "Add email validation for user registration"

# 6. Pushen
git push -u origin add-user-validation

# 7. Zurück zu main
git checkout main

# 8. Nach PR-Merge: main aktualisieren
git pull
```