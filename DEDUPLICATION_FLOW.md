# Creditor Deduplication Flow - Complete Overview

## Architecture Overview

There are **TWO deduplication systems** working together:

1. **FastAPI AI Deduplication** (Smart) - Within single job only
2. **Node.js Rule-Based Deduplication** (Simple) - Cross-job merging

---

## 1. FastAPI AI Deduplication (Same Job Only)

### Location
- **File**: `/tmp/Creditor-process-fastAPI/app/services/deduplicator.py`
- **Called from**: `/tmp/Creditor-process-fastAPI/app/routers/processing.py:338-354`

### How It Works

```python
# Step 1: Aggregate creditors from all documents in THIS job
deduplicator = CreditorDeduplicator(api_key=api_key)
aggregated_creditors = deduplicator.aggregate_creditors(results)

# Step 2: Send to Gemini AI for intelligent deduplication
deduplicated_creditors = await deduplicator.deduplicate_with_llm(aggregated_creditors)
```

### AI Deduplication Rules (Gemini 2.0 Flash)

The AI prompt instructs Gemini to:

1. **Primary key**: `reference_number` (exact match)
   - If ref number matches → same creditor (even if names differ)

2. **Missing ref fallback**:
   - If one entry has ref, other missing, but names very similar → merge

3. **Representative mix-up detection**:
   - If `is_representative=true` and `actual_creditor` matches another entry's `sender_name`
   - AND same `reference_number` → merge

4. **Fuzzy name matching**:
   - Can catch: "Georg We..." = "Georg Weah"
   - Can catch: "Legalhero GmbH" = "Anwalt Legalhero GmbH"

### Capabilities ✅
- ✅ Fuzzy name matching
- ✅ Representative detection
- ✅ Smart merging
- ✅ Handles typos, truncations, variations

### Limitations ❌
- ❌ **ONLY works within single job** (documents uploaded together)
- ❌ Doesn't help with documents uploaded separately (different batches)

---

## 2. Node.js Rule-Based Deduplication (Cross-Job)

### Location
- **File**: `/Users/luka.s/mandanten-portal-admin-download/server/utils/creditorDeduplication.js`
- **Called from**: `server/routes/webhooks.js` (3 places: lines 570, 622, 694)

### How It Works

```javascript
// Merge existing creditors with new ones from FastAPI
clientDoc.final_creditor_list = creditorDeduplication.mergeCreditorLists(
  existingCreditors,  // From previous uploads
  newCreditors,       // From current upload (already AI-deduped)
  'highest_amount'    // Keep highest amount when merging
);
```

### Deduplication Logic

**Step 1: Group by reference_number** (Lines 11-15)
```javascript
const groupedByRef = creditors.reduce((groups, creditor) => {
  const refNumber = creditor.reference_number || 'no_ref';
  (groups[refNumber] = groups[refNumber] || []).push(creditor);
  return groups;
}, {});
```

**Step 2: Within each ref group, group by sender_name** (Lines 25-29)
```javascript
const groupedByName = creditorsInGroup.reduce((groups, creditor) => {
  const senderName = creditor.sender_name || 'no_name';
  (groups[senderName] = groups[senderName] || []).push(creditor);
  return groups;
}, {});
```

**Step 3: For each (ref, name) group, pick ONE** (Lines 38-52)
```javascript
// Strategy: 'highest_amount' - keep creditor with highest claim
selectedCreditor = creditorsWithSameName.reduce((highest, current) => {
  const currentAmount = parseFloat(current.claim_amount) || 0;
  const highestAmount = parseFloat(highest.claim_amount) || 0;
  return currentAmount > highestAmount ? current : highest;
});
```

### Capabilities ✅
- ✅ Works across multiple uploads (cross-job)
- ✅ Exact reference number matching
- ✅ Exact name matching
- ✅ Keeps highest claim amount

### Limitations ❌
- ❌ **Requires EXACT string matches**
- ❌ "Legalhero GmbH" ≠ "Anwalt Legalhero GmbH"
- ❌ "Georg We..." ≠ "Georg Weah"
- ❌ No fuzzy matching
- ❌ No AI intelligence
- ❌ No typo tolerance

---

## Complete Flow Example

### Scenario: User uploads 3 documents in 2 separate batches

**Batch 1 (Upload 1):**
- Document A: "Legalhero GmbH", Ref: "EL-90784"
- Document B: "Georg We...", Ref: "N/A"

**What happens:**
1. FastAPI receives both → AI dedup → Recognizes both as unique (different refs)
2. Sends to Node.js: 2 creditors
3. Node.js merges with empty `final_creditor_list` → 2 creditors saved

---

**Batch 2 (Upload 2 - next day):**
- Document C: "Anwalt Legalhero GmbH", Ref: "N/A"

**What happens:**
1. FastAPI receives 1 document → No dedup needed (only 1 creditor)
2. Sends to Node.js: 1 creditor ("Anwalt Legalhero GmbH", Ref: "N/A")
3. Node.js attempts merge:
   - Group by ref: "N/A" group
   - Existing: "Georg We..." (N/A)
   - New: "Anwalt Legalhero GmbH" (N/A)
   - Group by name: "Georg We..." ≠ "Anwalt Legalhero GmbH" → **NOT MERGED** ❌
4. Result: 3 creditors in `final_creditor_list`

**Expected:** 2 unique creditors
**Actual:** 3 creditors (duplicate not caught)

---

## Current Issues

### Issue 1: Cross-Job Duplicates Not Caught

**Example:**
- Upload 1: "Legalhero GmbH" (Ref: "EL-90784")
- Upload 2: "Anwalt Legalhero GmbH" (Ref: "N/A")

**Why not caught:**
- Different refs: "EL-90784" ≠ "N/A" → Different groups
- Even if same ref, names don't match exactly → Not merged

### Issue 2: Truncated Names

**Example:**
- Upload 1: "Georg Weah" (Ref: "N/A")
- Upload 2: "Georg We..." (Ref: "N/A")

**Why not caught:**
- Same ref group: Both "N/A" ✓
- But "Georg Weah" ≠ "Georg We..." → Not merged ❌

### Issue 3: Name Variations

**Example:**
- "Klarna Bank AB (publ)"
- "Klarna Bank AB"
- "Klarna"

All different → Would NOT merge across batches

---

## Call Locations in Node.js

### 1. Main Webhook Processing (Line 570)
```javascript
// After receiving FastAPI results
clientDoc.final_creditor_list = creditorDeduplication.mergeCreditorLists(
  existing,
  normalizedDedupCreditors,
  'highest_amount'
);
```

### 2. Late Upload Auto-Add (Line 622)
```javascript
// When documents uploaded after admin approval
clientDoc.final_creditor_list = creditorDeduplication.mergeCreditorLists(
  existingList,
  newCreditors,
  'highest_amount'
);
```

### 3. Auto-Approval for Needs Review Docs (Line 694)
```javascript
// When auto-approving documents that were in needs_review
const mergedCreditors = creditorDeduplication.mergeCreditorLists(
  existingCreditors,
  dedupedFromDocs,
  'highest_amount'
);
```

---

## Proposed Solutions

### Option 1: Add Fuzzy Matching to Node.js

Use same `creditorLookup.js` logic that's used for DB enrichment:

```javascript
const { normalizeName, extractKeywords, stringSimilarity } = require('./creditorLookup');

function areSimilarCreditors(cred1, cred2) {
  // If refs match (and not N/A), definitely same
  if (cred1.reference_number && cred1.reference_number !== 'N/A' &&
      cred1.reference_number === cred2.reference_number) {
    return true;
  }

  // Fuzzy name matching
  const keywords1 = extractKeywords(cred1.sender_name);
  const keywords2 = extractKeywords(cred2.sender_name);

  const score = calculateMatchScore(keywords1, keywords2);

  return score >= 0.65; // 65% threshold
}
```

### Option 2: Send All Creditors to AI for Re-Dedup

After Node.js merge, send entire `final_creditor_list` back to FastAPI AI for re-deduplication:

```javascript
// After merging
const allCreditors = clientDoc.final_creditor_list;

// Call FastAPI endpoint: POST /deduplicate-creditors
const response = await axios.post('http://fastapi:8000/deduplicate-creditors', {
  creditors: allCreditors
});

clientDoc.final_creditor_list = response.data.deduplicated_creditors;
```

### Option 3: Hybrid Approach (Recommended)

1. Use fuzzy matching for "obvious" duplicates (>80% similarity)
2. Flag "potential" duplicates (65-80%) for manual review
3. Periodically re-run AI dedup on entire list (background job)

---

## Testing Strategy

### Test Cases to Cover

1. **Same ref, different names** → Should merge
2. **Different ref, similar names** → Should flag as potential duplicate
3. **Truncated names** (e.g., "Georg We..." vs "Georg Weah") → Should merge
4. **Name variations** (e.g., "Klarna" vs "Klarna Bank AB") → Should merge
5. **Representative mix-up** → Should merge
6. **Truly different creditors** → Should NOT merge

### Example Test Data

```javascript
const testCreditors = [
  { sender_name: "Legalhero GmbH", reference_number: "EL-90784", claim_amount: 100 },
  { sender_name: "Anwalt Legalhero GmbH", reference_number: "N/A", claim_amount: 100 },
  { sender_name: "Georg Weah", reference_number: "N/A", claim_amount: 50 },
  { sender_name: "Georg We...", reference_number: "N/A", claim_amount: 50 },
  { sender_name: "Klarna Bank AB (publ)", reference_number: "123", claim_amount: 200 },
  { sender_name: "Klarna", reference_number: "123", claim_amount: 200 },
];

// Expected after dedup: 3 unique creditors
// 1. Legalhero (merged)
// 2. Georg Weah (merged)
// 3. Klarna (merged)
```

---

## Next Steps

1. **Decide on approach**: Fuzzy matching, AI re-dedup, or hybrid?
2. **Implement solution** in `creditorDeduplication.js`
3. **Add tests** for cross-job deduplication
4. **Test with real data** from production
5. **Monitor deduplication stats** (before/after)

