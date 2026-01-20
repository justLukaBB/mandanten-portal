# Robuste AI Deduplication Lösung - Design Document

## 🎯 Ziel

Eine AI-basierte Deduplication die funktioniert:
- ✅ Innerhalb eines Jobs (wie aktuell)
- ✅ Über mehrere Uploads hinweg (NEU!)
- ✅ Auch bei nachträglich hochgeladenen Dokumenten
- ✅ Mit Fuzzy Matching, Typos, Variationen
- ✅ Schnell und kosteneffizient

---

## 🏗️ Vorgeschlagene Architektur

### **Hybrid Approach: Smart Pre-Filter + AI Confirmation**

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER UPLOADS DOCUMENTS                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              FASTAPI: Process Documents                          │
│  • Extract data                                                  │
│  • AI Dedup WITHIN job (existing logic)                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                  Webhook → Node.js
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              NODE.JS: Cross-Job Deduplication                    │
│                                                                   │
│  STEP 1: Quick Pre-Filter (Fuzzy Matching)                      │
│  ├─ Exact ref match → Merge immediately                         │
│  ├─ 80%+ name similarity → Potential duplicate                  │
│  └─ <65% similarity → Definitely different                      │
│                                                                   │
│  STEP 2: AI Confirmation (only for potential duplicates)        │
│  ├─ Send to FastAPI: POST /deduplicate-potential-duplicates     │
│  ├─ AI analyzes: Should these merge?                            │
│  └─ Merge based on AI decision                                  │
│                                                                   │
│  STEP 3: Periodic Full Re-Dedup (optional)                      │
│  ├─ Every N uploads OR weekly                                   │
│  └─ Send entire list to FastAPI for complete re-dedup           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Plan

### Phase 1: Node.js Fuzzy Pre-Filter

**File**: `server/utils/creditorDeduplication.js`

**Add fuzzy matching logic:**

```javascript
const { normalizeName, extractKeywords } = require('./creditorLookup');

function calculateNameSimilarity(name1, name2) {
  const keywords1 = extractKeywords(name1);
  const keywords2 = extractKeywords(name2);

  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  let matchCount = 0;
  for (const kw1 of keywords1) {
    for (const kw2 of keywords2) {
      if (kw1 === kw2) {
        matchCount++;
        break;
      }
      // Fuzzy match for typos
      if (isTypoMatch(kw1, kw2)) {
        matchCount += 0.8;
        break;
      }
    }
  }

  return matchCount / Math.max(keywords1.length, keywords2.length);
}

function groupPotentialDuplicates(creditors) {
  const groups = [];
  const processed = new Set();

  for (let i = 0; i < creditors.length; i++) {
    if (processed.has(i)) continue;

    const group = [creditors[i]];
    processed.add(i);

    for (let j = i + 1; j < creditors.length; j++) {
      if (processed.has(j)) continue;

      const similarity = calculateNameSimilarity(
        creditors[i].sender_name,
        creditors[j].sender_name
      );

      // Same reference OR high name similarity
      const sameRef = creditors[i].reference_number === creditors[j].reference_number &&
                      creditors[i].reference_number !== 'N/A';

      if (sameRef || similarity >= 0.80) {
        group.push(creditors[j]);
        processed.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}
```

### Phase 2: FastAPI AI Confirmation Endpoint

**New File**: `/tmp/Creditor-process-fastAPI/app/routers/deduplication.py`

```python
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from ..services.deduplicator import CreditorDeduplicator
from ..config import settings
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/deduplicate-potential-duplicates")
async def deduplicate_potential_duplicates(
    request: Dict[str, Any]
):
    """
    Analyzes a group of potentially duplicate creditors and determines
    if they should be merged.

    Input:
    {
      "potential_duplicates": [
        { "sender_name": "...", "reference_number": "...", ... },
        { "sender_name": "...", "reference_number": "...", ... }
      ]
    }

    Output:
    {
      "should_merge": true,
      "merged_creditor": { ... },
      "reason": "Same reference number and similar names"
    }
    OR
    {
      "should_merge": false,
      "reason": "Different creditors despite name similarity"
    }
    """
    try:
        potential_duplicates = request.get("potential_duplicates", [])

        if len(potential_duplicates) < 2:
            return {"should_merge": False, "reason": "Less than 2 creditors"}

        # Use AI to analyze
        deduplicator = CreditorDeduplicator(api_key=settings.gemini_api_key)

        # Create focused prompt for this specific group
        prompt = f"""Analyze these {len(potential_duplicates)} creditor entries and determine if they represent the SAME creditor or DIFFERENT creditors:

{json.dumps(potential_duplicates, indent=2, ensure_ascii=False)}

Consider:
1. Reference numbers (exact match = definitely same)
2. Name variations (e.g., "Legalhero GmbH" vs "Anwalt Legalhero GmbH")
3. Truncated names (e.g., "Georg We..." vs "Georg Weah")
4. Representative mix-ups
5. Typos or OCR errors

Respond with ONLY a JSON object:
{{
  "should_merge": true/false,
  "reason": "Brief explanation",
  "merged_creditor": {{ ... }} // Only if should_merge=true
}}

If should_merge=true, provide the merged creditor with:
- Best values from all entries (prefer non-N/A)
- source_documents array with all document filenames
- merged_from count
"""

        response = deduplicator.model.generate_content(prompt)
        result = json.loads(response.text.strip())

        return result

    except Exception as e:
        logger.error(f"Error in deduplicate_potential_duplicates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/deduplicate-all")
async def deduplicate_all(request: Dict[str, Any]):
    """
    Re-deduplicate entire creditor list.
    Used for periodic full re-dedup or when user requests it.

    Input:
    {
      "creditors": [ ... entire final_creditor_list ... ]
    }

    Output:
    {
      "deduplicated_creditors": [ ... ],
      "stats": {
        "original_count": 10,
        "unique_count": 7,
        "duplicates_removed": 3
      }
    }
    """
    try:
        creditors = request.get("creditors", [])

        if not creditors:
            return {"deduplicated_creditors": [], "stats": {}}

        deduplicator = CreditorDeduplicator(api_key=settings.gemini_api_key)
        deduplicated = await deduplicator.deduplicate_with_llm(creditors)

        stats = {
            "original_count": len(creditors),
            "unique_count": len(deduplicated),
            "duplicates_removed": len(creditors) - len(deduplicated)
        }

        return {
            "deduplicated_creditors": deduplicated,
            "stats": stats
        }

    except Exception as e:
        logger.error(f"Error in deduplicate_all: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

**Register router** in `/tmp/Creditor-process-fastAPI/app/main.py`:

```python
from .routers import processing, deduplication

app.include_router(processing.router)
app.include_router(deduplication.router, prefix="/api/dedup", tags=["deduplication"])
```

### Phase 3: Node.js Integration

**Update**: `server/routes/webhooks.js`

```javascript
// After receiving deduplicated_creditors from FastAPI
// STEP 1: Merge with existing list (as before)
const allCreditors = [...existing, ...normalizedDedupCreditors];

// STEP 2: Smart cross-job deduplication
const deduplicatedList = await smartCrossJobDedup(allCreditors, client_id);

clientDoc.final_creditor_list = deduplicatedList;

// Helper function
async function smartCrossJobDedup(creditors, clientId) {
  // Quick exact match dedup (no AI needed)
  const exactDeduped = creditorDeduplication.deduplicateCreditors(creditors);

  // Find potential duplicates with fuzzy matching
  const groups = groupPotentialDuplicates(exactDeduped);

  // Filter groups that need AI confirmation (more than 1 creditor)
  const needsAI = groups.filter(g => g.length > 1);

  if (needsAI.length === 0) {
    // No potential duplicates, return as-is
    return exactDeduped;
  }

  console.log(`[dedup] Found ${needsAI.length} potential duplicate groups, sending to AI...`);

  // Process each group with AI
  const finalList = [];

  for (const group of groups) {
    if (group.length === 1) {
      // No duplicates in this group
      finalList.push(group[0]);
      continue;
    }

    // Ask AI to confirm if these should merge
    try {
      const response = await axios.post(
        `${FASTAPI_URL}/api/dedup/deduplicate-potential-duplicates`,
        { potential_duplicates: group },
        {
          headers: { 'X-API-Key': process.env.FASTAPI_API_KEY },
          timeout: 30000
        }
      );

      if (response.data.should_merge) {
        // AI confirmed: merge these creditors
        console.log(`[dedup] AI merged ${group.length} creditors: ${response.data.reason}`);
        finalList.push(response.data.merged_creditor);
      } else {
        // AI says: keep separate
        console.log(`[dedup] AI kept separate: ${response.data.reason}`);
        finalList.push(...group);
      }
    } catch (error) {
      console.error(`[dedup] AI confirmation failed, keeping separate:`, error.message);
      // Fallback: keep separate if AI fails
      finalList.push(...group);
    }
  }

  return finalList;
}
```

---

## 🚀 Optimizations

### 1. **Caching Strategy**

```javascript
// Cache AI decisions to avoid repeated API calls
const dedupCache = new Map();

function getCacheKey(group) {
  return group.map(c => c.sender_name + '|' + c.reference_number).sort().join('::');
}

const cacheKey = getCacheKey(group);
if (dedupCache.has(cacheKey)) {
  return dedupCache.get(cacheKey);
}

const result = await callAI(group);
dedupCache.set(cacheKey, result);
```

### 2. **Batch Processing**

```javascript
// Process multiple groups in single AI call
const response = await axios.post('/api/dedup/deduplicate-batch', {
  groups: needsAI  // Send all groups at once
});
```

### 3. **Incremental Updates Only**

```javascript
// Only re-dedup when new creditors added
if (normalizedDedupCreditors.length > 0) {
  // Only compare new creditors against existing ones
  const deduped = await incrementalDedup(existing, normalizedDedupCreditors);
}
```

### 4. **Background Re-Dedup**

```javascript
// Periodic full re-dedup (weekly, triggered by cron)
async function periodicFullRededup() {
  const clients = await Client.find({
    final_creditor_list: { $exists: true, $ne: [] }
  });

  for (const client of clients) {
    const response = await axios.post('/api/dedup/deduplicate-all', {
      creditors: client.final_creditor_list
    });

    client.final_creditor_list = response.data.deduplicated_creditors;
    await client.save();

    console.log(`[periodic-dedup] ${client.aktenzeichen}: ${response.data.stats.duplicates_removed} duplicates removed`);
  }
}
```

---

## 📊 Monitoring & Metrics

### Track Deduplication Stats

```javascript
// Add to client schema
deduplication_history: [{
  timestamp: Date,
  method: String, // 'initial', 'cross-job-ai', 'periodic-full'
  before_count: Number,
  after_count: Number,
  duplicates_removed: Number,
  ai_calls_made: Number,
  processing_time_ms: Number
}]
```

### Log Important Events

```javascript
console.log('[dedup-stats]', {
  client_id,
  method: 'cross-job-ai',
  potential_groups: needsAI.length,
  ai_calls_made: aiCallCount,
  before_count: allCreditors.length,
  after_count: finalList.length,
  duplicates_removed: allCreditors.length - finalList.length,
  processing_time_ms: Date.now() - startTime
});
```

---

## 🧪 Testing Scenarios

### Test Case 1: Cross-Job Duplicates
```javascript
// Upload 1
{ sender_name: "Legalhero GmbH", reference_number: "EL-90784" }

// Upload 2 (next day)
{ sender_name: "Anwalt Legalhero GmbH", reference_number: "N/A" }

// Expected: AI merges → 1 creditor in final_creditor_list
```

### Test Case 2: Truncated Names
```javascript
// Upload 1
{ sender_name: "Georg Weah", reference_number: "N/A" }

// Upload 2
{ sender_name: "Georg We...", reference_number: "N/A" }

// Expected: 80%+ similarity → AI confirms merge → 1 creditor
```

### Test Case 3: Different Creditors (False Positive)
```javascript
// Upload 1
{ sender_name: "Georg Müller", reference_number: "ABC123" }

// Upload 2
{ sender_name: "Georg Schmidt", reference_number: "XYZ789" }

// Expected: Different refs, low similarity → Keep separate → 2 creditors
```

### Test Case 4: Representative Mix-Up
```javascript
// Upload 1
{
  sender_name: "Anwalt Schmidt",
  is_representative: true,
  actual_creditor: "Klarna Bank",
  reference_number: "K-123"
}

// Upload 2
{
  sender_name: "Klarna Bank",
  is_representative: false,
  reference_number: "K-123"
}

// Expected: AI recognizes representative relationship → Merge → 1 creditor
```

---

## 💰 Cost Estimation

### AI API Costs (Gemini 2.0 Flash)

**Assumptions:**
- Average client: 10 creditors
- Average upload: 3 new creditors
- Potential duplicate groups: 1-2 per upload
- Prompt + Response: ~500 tokens per group

**Per Upload:**
- Initial dedup (FastAPI): FREE (already running)
- Cross-job AI calls: 1-2 groups × $0.0001 = **$0.0002**
- Total: **< $0.001 per upload**

**Monthly (100 clients, 3 uploads each):**
- 300 uploads × $0.001 = **$0.30/month**

**Periodic full re-dedup (weekly):**
- 100 clients × 10 creditors × $0.001 = **$1.00/week** = **$4/month**

**Total monthly cost: ~$5** (sehr günstig!)

---

## ✅ Implementation Checklist

- [ ] Phase 1: Add fuzzy matching to Node.js
  - [ ] Create `groupPotentialDuplicates()` function
  - [ ] Add similarity calculation
  - [ ] Test with real data

- [ ] Phase 2: Create FastAPI endpoints
  - [ ] `/api/dedup/deduplicate-potential-duplicates`
  - [ ] `/api/dedup/deduplicate-all`
  - [ ] Add to router
  - [ ] Test endpoints

- [ ] Phase 3: Integrate with Node.js webhook
  - [ ] Add `smartCrossJobDedup()` function
  - [ ] Update webhook processing
  - [ ] Add error handling
  - [ ] Add logging

- [ ] Phase 4: Monitoring & Optimization
  - [ ] Add deduplication_history to client schema
  - [ ] Implement caching
  - [ ] Add metrics dashboard
  - [ ] Set up periodic re-dedup cron job

- [ ] Phase 5: Testing
  - [ ] Unit tests for fuzzy matching
  - [ ] Integration tests for AI endpoints
  - [ ] E2E tests with real scenarios
  - [ ] Performance testing

---

## 🎓 Benefits of This Solution

✅ **Accurate**: AI catches fuzzy matches that rules miss
✅ **Fast**: Pre-filter reduces AI calls by 80%+
✅ **Cost-effective**: <$5/month for typical usage
✅ **Scalable**: Works with 10 or 1000 creditors
✅ **Reliable**: Fallback to rule-based if AI fails
✅ **Transparent**: Logs why merges happened
✅ **Future-proof**: Can add more intelligence over time

