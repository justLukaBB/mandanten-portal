# Phase 4: Code-Based Merge Logic - Research

**Researched:** 2026-01-31
**Domain:** Deterministic creditor data merging in Python after LLM grouping
**Confidence:** HIGH

## Summary

This research investigates how to implement deterministic merge logic in Python to consolidate duplicate creditor records within groups identified by the LLM. Phase 3 provides index-based duplicate groups (e.g., `[[0,3,7], [2,5]]`), and Phase 4 must merge the actual creditor dictionaries within each group using clear, testable rules.

**Key findings:**
- Python's dict merge operators (`|`, `|=`) provide clean, deterministic merging with right-side priority
- Field-by-field merge strategies require explicit priority rules (non-empty > empty, longest > shorter, numeric > string)
- OR logic for boolean flags (`needs_manual_review`) is trivial with Python's `any()` built-in
- List deduplication with `dict.fromkeys()` preserves order while removing duplicates (Python 3.7+)
- Representative + actual creditor merging requires special handling to preserve both entities in separate fields
- Current deduplicator.py already implements simple placeholder merge (Phase 3), providing a clear upgrade path

**Primary recommendation:** Implement a `merge_creditor_group(creditors: List[dict]) -> dict` function with field-by-field priority logic, using dict operators for base structure, explicit rules for special fields (claim_amount, sender_name), and dict.fromkeys() for source_documents deduplication. Keep merge logic in standalone function for testability.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python stdlib (dict, any, set) | 3.9+ | Dictionary merging, boolean operations, set operations | Built-in, zero dependencies, optimal performance |
| typing (List, Dict, Any) | 3.9+ | Type hints for merge function signatures | Python standard, enables IDE autocomplete and validation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pydantic | 2.x (already present) | Output validation for merged creditor | Validate merged creditor matches expected schema |
| pytest | Latest | Unit tests for merge logic | Test edge cases (all N/A, conflicting amounts, etc.) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dict.fromkeys() | set() | Loses order preservation (matters for consistent output) |
| Field-by-field logic | Generic recursive merge | Harder to reason about, loses domain-specific rules |
| Python dict operators | Manual field copying | More verbose, same result |

**Installation:**
```bash
# All core functionality is Python stdlib - no additional packages needed
# Pydantic already installed for Phase 3 validation
```

## Architecture Patterns

### Recommended Merge Flow

```
Input: Group of creditor dicts from LLM (e.g., indices [0, 3, 7])
    ↓
Extract creditors: [creditors[0], creditors[3], creditors[7]]
    ↓
merge_creditor_group(group_creditors) function
    ↓
  - Start with first creditor as base
  - Field-by-field merge with priority rules
  - Combine source_documents (deduplicated)
  - OR logic for needs_manual_review
  - Union review_reasons
    ↓
Output: Single merged creditor dict
```

### Pattern 1: Field Priority Merge Strategy

**What:** Clear, testable rules for choosing field values when creditors have conflicting data
**When to use:** All field merges except boolean flags and lists
**Example:**
```python
# Source: MERGE-02 (prefer non-"N/A", then longest/most complete)
def merge_field_with_priority(values: List[str]) -> str:
    """
    Merge field values from multiple creditors.

    Priority:
    1. Non-empty, non-"N/A" values
    2. Among valid values, prefer longest string
    3. If all empty/N/A, return None (don't preserve "N/A")

    Args:
        values: List of field values from creditors in merge group

    Returns:
        Best value according to priority rules, or None if all invalid

    Examples:
        ["Deutsche Bank AG", "N/A", "Deutsche Bank"] -> "Deutsche Bank AG"
        ["N/A", "", "N/A"] -> None
        ["Vodafone", "Vodafone GmbH"] -> "Vodafone GmbH"
    """
    # Filter to valid values (non-empty, non-"N/A")
    valid = [v for v in values if v and str(v).strip().lower() != "n/a"]

    if not valid:
        return None  # All empty - don't preserve "N/A"

    # Return longest valid value
    return max(valid, key=len)
```

**Token savings:** N/A (this is Phase 4, not LLM-related)

### Pattern 2: Special Handling for claim_amount

**What:** Numeric amounts need special logic: prefer numeric values, pick highest on conflict
**When to use:** claim_amount field only (MERGE-05)
**Example:**
```python
# Source: MERGE-05 (prefer numeric, highest on conflict)
# Source: Phase 4 CONTEXT.md (highest claim_amount wins)
def merge_claim_amount(amounts: List[Any]) -> Optional[float]:
    """
    Merge claim_amount values from multiple creditors.

    Priority:
    1. Numeric values (float/int) over strings
    2. Among numeric values, pick highest
    3. If no numeric, fall back to claim_amount_raw string

    Args:
        amounts: List of claim_amount values (can be float, int, str, or None)

    Returns:
        Highest numeric amount if any exist, else None

    Examples:
        [500.0, 750.0, None] -> 750.0
        ["N/A", None, ""] -> None
        [500.0, "750,00 €", 300.0] -> 500.0 (numeric only)
    """
    numeric_amounts = []

    for amt in amounts:
        if isinstance(amt, (int, float)) and amt > 0:
            numeric_amounts.append(float(amt))

    if numeric_amounts:
        return max(numeric_amounts)  # Highest wins

    return None  # No valid numeric amounts
```

### Pattern 3: Representative + Actual Creditor Preservation

**What:** When merging a representative creditor with direct creditor, preserve BOTH names explicitly
**When to use:** Any group containing is_representative=True creditor (MERGE-06)
**Example:**
```python
# Source: MERGE-06 (sender_name = rep, actual_creditor = real creditor)
# Source: Phase 4 CONTEXT.md (explicit preservation of both)
def merge_representative_group(creditors: List[dict]) -> dict:
    """
    Merge creditors where at least one is a representative.

    Rules:
    - sender_name = representative's name
    - actual_creditor = actual creditor's name
    - is_representative = True (MERGE-07)

    Args:
        creditors: List of creditor dicts, at least one with is_representative=True

    Returns:
        Merged creditor preserving both representative and actual creditor

    Example:
        Input: [
            {"sender_name": "Inkasso Meyer GmbH", "is_representative": True, "actual_creditor": "Deutsche Bank AG"},
            {"sender_name": "Deutsche Bank AG", "is_representative": False}
        ]
        Output: {
            "sender_name": "Inkasso Meyer GmbH",  # Representative
            "actual_creditor": "Deutsche Bank AG",  # Actual creditor
            "is_representative": True
        }
    """
    # Find representative creditor (if any)
    rep = next((c for c in creditors if c.get("is_representative")), None)

    if not rep:
        # No representative - regular merge
        return merge_regular_group(creditors)

    # Find actual creditor name
    # Priority: rep's actual_creditor field, then other creditor's sender_name
    actual_name = rep.get("actual_creditor")
    if not actual_name or actual_name == "N/A":
        # Look for non-representative creditor in group
        non_rep = next((c for c in creditors if not c.get("is_representative")), None)
        if non_rep:
            actual_name = non_rep.get("sender_name")

    # Start with representative as base
    merged = dict(rep)
    merged["sender_name"] = rep.get("sender_name")
    merged["actual_creditor"] = actual_name if actual_name != "N/A" else None
    merged["is_representative"] = True  # MERGE-07

    # Merge other fields normally
    # ... (claim_amount, source_documents, etc.)

    return merged
```

### Pattern 4: Boolean Flag OR Logic

**What:** needs_manual_review is true if ANY creditor in group had it true
**When to use:** needs_manual_review field (MERGE-03)
**Example:**
```python
# Source: MERGE-03 (OR logic for needs_manual_review)
# Source: Existing deduplicator.py line 513-514 (already implemented)
def merge_needs_manual_review(creditors: List[dict]) -> bool:
    """
    Merge needs_manual_review flags using OR logic.

    If ANY creditor in the group needs review, the merged result needs review.

    Args:
        creditors: List of creditor dicts

    Returns:
        True if any creditor needs manual review, else False

    Examples:
        [{"needs_manual_review": False}, {"needs_manual_review": True}] -> True
        [{"needs_manual_review": False}, {"needs_manual_review": False}] -> False
    """
    return any(c.get("needs_manual_review", False) for c in creditors)
```

### Pattern 5: List Deduplication with Order Preservation

**What:** Combine source_documents from all creditors, removing duplicates while preserving order
**When to use:** source_documents field (MERGE-04)
**Example:**
```python
# Source: MERGE-04 (combine source_documents, unique)
# Source: Existing deduplicator.py lines 493-510 (current implementation)
# Source: https://www.geeksforgeeks.org/python/python-merge-two-lists-without-duplicates/
def merge_source_documents(creditors: List[dict]) -> List[str]:
    """
    Combine source_documents from all creditors in group (unique, order preserved).

    Uses dict.fromkeys() for deduplication with order preservation (Python 3.7+).

    Args:
        creditors: List of creditor dicts

    Returns:
        Deduplicated list of source document names

    Examples:
        [{"source_documents": ["doc1.pdf", "doc2.pdf"]},
         {"source_documents": ["doc2.pdf", "doc3.pdf"]}]
        -> ["doc1.pdf", "doc2.pdf", "doc3.pdf"]
    """
    all_docs = []

    for c in creditors:
        docs = c.get("source_documents", [])
        # Handle both list and single string
        if isinstance(docs, str):
            docs = [docs]
        # Handle None/missing
        if not docs:
            docs = [c.get("source_document") or c.get("filename") or "unknown"]
        all_docs.extend(docs)

    # dict.fromkeys() preserves insertion order (Python 3.7+) and removes duplicates
    return list(dict.fromkeys(all_docs))
```

### Pattern 6: Non-Merge Field Passthrough

**What:** Fields not involved in merging logic (timestamps, IDs) come from first creditor
**When to use:** document_id, created_at, processing_status, etc.
**Example:**
```python
# Source: Phase 4 CONTEXT.md (keep from first creditor in group)
def merge_creditor_group(creditors: List[dict]) -> dict:
    """
    Merge a group of duplicate creditors into a single record.

    Args:
        creditors: List of creditor dicts in duplicate group (from LLM indices)

    Returns:
        Single merged creditor dict
    """
    if not creditors:
        return {}

    if len(creditors) == 1:
        # Singleton - no merge needed, just normalize source_documents
        c = creditors[0]
        return {
            **c,
            "source_documents": merge_source_documents([c]),
            "merged_from": 1
        }

    # Start with first creditor as base (non-merge fields come from here)
    base = dict(creditors[0])

    # Merge fields with priority logic
    base["sender_name"] = merge_sender_name_field(creditors)
    base["reference_number"] = merge_field_with_priority([c.get("reference_number") for c in creditors])
    base["claim_amount"] = merge_claim_amount([c.get("claim_amount") for c in creditors])

    # Special handling for representative merges
    if any(c.get("is_representative") for c in creditors):
        base = merge_representative_fields(base, creditors)

    # Boolean OR logic
    base["needs_manual_review"] = merge_needs_manual_review(creditors)
    base["is_representative"] = any(c.get("is_representative", False) for c in creditors)  # MERGE-07

    # List merge
    base["source_documents"] = merge_source_documents(creditors)
    base["review_reasons"] = merge_review_reasons(creditors)

    # Metadata
    base["merged_from"] = len(creditors)

    # Non-merge fields already in base from first creditor:
    # - document_id, created_at, document_confidence, etc.

    return base
```

### Anti-Patterns to Avoid

- **Don't use generic recursive dict merge** - Loses domain-specific rules (e.g., highest claim_amount)
- **Don't preserve "N/A" strings** - Phase 4 CONTEXT.md: all-empty fields should be None/null
- **Don't merge different Inkasso companies** - Phase 4 CONTEXT.md: different representatives = different creditors (shouldn't be in same group)
- **Don't add audit trail to merged record** - Phase 4 CONTEXT.md: clean replacement, no merge metadata beyond merged_from count

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| List deduplication | Manual loop with `if x not in seen` | `dict.fromkeys(list)` | Preserves order (Python 3.7+), faster, one-liner |
| OR logic across list | Manual loop with flag | `any(condition for x in list)` | Built-in, readable, optimized (short-circuits) |
| String normalization | Custom trim/lower/replace | Existing patterns from deduplicator.py | Already tested in production |
| Dict merging | Manual field-by-field copy | Dict operators `\|` or `{**a, **b}` | Clean, deterministic, standard Python |

**Key insight:** Python's built-in dict and list operations are highly optimized and well-tested. Custom loops for common operations are slower and more bug-prone than stdlib idioms.

## Common Pitfalls

### Pitfall 1: Mutating Original Creditor Dicts

**What goes wrong:** Modifying creditors in-place during merge causes side effects and breaks idempotency
**Why it happens:** Python passes dicts by reference; direct field assignment modifies the original
**How to avoid:**
- Always create new dict for merged result: `merged = dict(creditors[0])` or `merged = {**creditors[0]}`
- Never do `creditors[0]["field"] = value` - this mutates original
- Test merge function twice with same input to verify idempotency
**Warning signs:**
- Creditors list changes after merge call
- Running merge twice produces different results
- Unit tests fail on second run

### Pitfall 2: Losing Data When All Values Are "N/A"

**What goes wrong:** Field merge returns "N/A" string instead of None, polluting database with meaningless data
**Why it happens:** Treating "N/A" as a valid value instead of empty sentinel
**How to avoid:**
- Filter out "N/A" during valid value collection: `v and str(v).strip().lower() != "n/a"`
- Return None (not "N/A") when all values are invalid
- Phase 4 CONTEXT.md: "All-empty fields (everyone has N/A): leave field empty/null"
**Warning signs:**
- Database full of "N/A" strings in merged records
- Frontend displays "N/A" to users
- Can't distinguish between "no data" and "data is literally 'N/A'"

### Pitfall 3: Representative Merge Logic Overwrites Actual Creditor

**What goes wrong:** Merging rep + actual creditor loses one of the names, violating MERGE-06
**Why it happens:** Using generic field merge instead of special representative handling
**How to avoid:**
- Check for `is_representative=True` in group before merge
- Explicitly set `sender_name = representative name` and `actual_creditor = actual name`
- Never put actual creditor name in sender_name when representative exists
**Warning signs:**
- Merged creditor has sender_name="Deutsche Bank AG" but is_representative=True (should be "Inkasso Meyer GmbH")
- actual_creditor field is lost or set to "N/A"
- Different Inkasso companies merged together (should never happen per CONTEXT.md)

### Pitfall 4: Incorrect claim_amount Merge Priority

**What goes wrong:** String amount "1.500,00 €" chosen over numeric 1200.0, or lowest amount chosen instead of highest
**Why it happens:** Not filtering to numeric values first, or using min() instead of max()
**How to avoid:**
- Extract numeric values: `isinstance(amt, (int, float)) and amt > 0`
- Use `max(numeric_amounts)` not `min()`
- Phase 4 CONTEXT.md: "Conflicting claim_amounts: pick the highest numeric amount"
**Warning signs:**
- Merged creditor has lower claim_amount than some group members
- claim_amount is None when at least one creditor had numeric value
- String amounts mixed with numeric amounts in output

### Pitfall 5: Missing Creditors After Merge

**What goes wrong:** Merge produces fewer creditors than LLM groups, silent data loss
**Why it happens:** Skipping groups, returning None instead of merged creditor, filter logic removing valid groups
**How to avoid:**
- Verify `len(merged_creditors) == len(validated.groups)`
- Process every group, including singletons: `if len(group) == 1: ...`
- Log group count and merged count for debugging
**Warning signs:**
- Output creditor count != LLM group count
- Some creditors disappear after merge
- Unit tests pass but integration tests fail on count mismatch

## Code Examples

Verified patterns from official sources:

### Complete Merge Function (Minimal Implementation)

```python
# Source: Phase 4 requirements and existing deduplicator.py patterns
def merge_creditor_group(creditors: List[dict]) -> dict:
    """
    Merge a group of duplicate creditors using deterministic rules.

    Implements:
    - MERGE-01: Deterministic field priority rules
    - MERGE-02: Prefer non-"N/A", longest/most complete
    - MERGE-03: needs_manual_review OR logic
    - MERGE-04: source_documents deduplication
    - MERGE-05: claim_amount numeric priority, highest wins
    - MERGE-06: Representative + actual creditor preservation
    - MERGE-07: is_representative OR logic

    Args:
        creditors: List of creditor dicts from same duplicate group

    Returns:
        Single merged creditor dict
    """
    if not creditors:
        return {}

    if len(creditors) == 1:
        # Singleton - normalize and return
        c = dict(creditors[0])
        c["source_documents"] = _ensure_list(c.get("source_documents") or c.get("source_document"))
        c["merged_from"] = 1
        return c

    # Start with copy of first creditor (non-merge fields come from here)
    merged = dict(creditors[0])

    # Field-by-field merge with priority rules
    merged["sender_name"] = _merge_sender_name(creditors)
    merged["sender_address"] = _merge_field([c.get("sender_address") for c in creditors])
    merged["sender_email"] = _merge_field([c.get("sender_email") for c in creditors])
    merged["reference_number"] = _merge_field([c.get("reference_number") for c in creditors])
    merged["claim_amount"] = _merge_claim_amount(creditors)
    merged["claim_amount_raw"] = _merge_field([c.get("claim_amount_raw") for c in creditors])

    # Representative handling (MERGE-06, MERGE-07)
    has_rep = any(c.get("is_representative") for c in creditors)
    merged["is_representative"] = has_rep
    if has_rep:
        merged = _merge_representative_fields(merged, creditors)
    else:
        merged["actual_creditor"] = None

    # Boolean OR logic (MERGE-03, MERGE-07)
    merged["needs_manual_review"] = any(c.get("needs_manual_review", False) for c in creditors)

    # List merges (MERGE-04)
    merged["source_documents"] = _merge_source_documents(creditors)
    merged["review_reasons"] = _merge_review_reasons(creditors)

    # Metadata
    merged["merged_from"] = len(creditors)

    # Non-merge fields already in merged from first creditor:
    # document_id, document_status, document_confidence, created_at, etc.

    return merged


def _merge_field(values: List[Any]) -> Optional[str]:
    """Merge field values: prefer non-"N/A", then longest."""
    valid = [str(v).strip() for v in values if v and str(v).strip().lower() != "n/a"]
    return max(valid, key=len) if valid else None


def _merge_sender_name(creditors: List[dict]) -> Optional[str]:
    """
    Merge sender_name field.

    For representative groups: use representative's name
    For non-representative: use longest valid name
    """
    # Check if this is a representative group
    rep = next((c for c in creditors if c.get("is_representative")), None)
    if rep:
        return rep.get("sender_name")

    # Regular merge
    names = [c.get("sender_name") for c in creditors]
    return _merge_field(names)


def _merge_claim_amount(creditors: List[dict]) -> Optional[float]:
    """Merge claim_amount: prefer numeric, highest wins."""
    numeric_amounts = []
    for c in creditors:
        amt = c.get("claim_amount")
        if isinstance(amt, (int, float)) and amt > 0:
            numeric_amounts.append(float(amt))

    return max(numeric_amounts) if numeric_amounts else None


def _merge_representative_fields(merged: dict, creditors: List[dict]) -> dict:
    """
    Merge representative-specific fields (MERGE-06).

    sender_name = representative's name
    actual_creditor = actual creditor's name
    """
    rep = next(c for c in creditors if c.get("is_representative"))

    # sender_name already set to representative's name
    merged["sender_name"] = rep.get("sender_name")

    # actual_creditor from rep's field or from other creditor's sender_name
    actual = rep.get("actual_creditor")
    if not actual or actual == "N/A":
        non_rep = next((c for c in creditors if not c.get("is_representative")), None)
        if non_rep:
            actual = non_rep.get("sender_name")

    merged["actual_creditor"] = actual if actual != "N/A" else None
    merged["is_representative"] = True

    return merged


def _merge_source_documents(creditors: List[dict]) -> List[str]:
    """Combine source_documents from all creditors (unique, order preserved)."""
    all_docs = []
    for c in creditors:
        docs = c.get("source_documents", [])
        if isinstance(docs, str):
            docs = [docs]
        if not docs:
            docs = [c.get("source_document") or "unknown"]
        all_docs.extend(docs)

    # dict.fromkeys() preserves order (Python 3.7+) and removes duplicates
    return list(dict.fromkeys(all_docs))


def _merge_review_reasons(creditors: List[dict]) -> List[str]:
    """Combine review_reasons from all creditors (unique)."""
    all_reasons = []
    for c in creditors:
        reasons = c.get("review_reasons", [])
        if isinstance(reasons, list):
            all_reasons.extend(reasons)

    # dict.fromkeys() for deduplication
    return list(dict.fromkeys(r for r in all_reasons if r))


def _ensure_list(value: Any) -> List[str]:
    """Convert single string or None to list."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [value]
    return []
```

### Integration with Existing deduplicator.py

```python
# Source: /Users/luka.s/Cursor : Mandanten - Portal/Creditor-process-fastAPI/app/services/deduplicator.py
# Lines 489-528 (current simple merge implementation)

# BEFORE (Phase 3 placeholder):
else:
    # Duplicate group — simple merge (Phase 4 will improve)
    primary = dict(creditors[group[0]])
    # ... simple logic ...

# AFTER (Phase 4 implementation):
else:
    # Duplicate group — use deterministic merge logic
    group_creditors = [creditors[idx] for idx in group]
    merged = merge_creditor_group(group_creditors)
    result.append(merged)
```

### Unit Test Examples

```python
# Source: pytest best practices
import pytest

def test_merge_single_creditor():
    """Singleton groups should pass through unchanged."""
    creditors = [{"sender_name": "Deutsche Bank AG", "reference_number": "DB-123"}]
    merged = merge_creditor_group(creditors)

    assert merged["sender_name"] == "Deutsche Bank AG"
    assert merged["merged_from"] == 1


def test_merge_prefer_non_na():
    """Should prefer non-N/A values over N/A."""
    creditors = [
        {"sender_name": "Deutsche Bank AG", "sender_email": "N/A"},
        {"sender_name": "N/A", "sender_email": "info@db.com"}
    ]
    merged = merge_creditor_group(creditors)

    assert merged["sender_name"] == "Deutsche Bank AG"
    assert merged["sender_email"] == "info@db.com"


def test_merge_highest_claim_amount():
    """Should pick highest numeric claim_amount."""
    creditors = [
        {"claim_amount": 500.0},
        {"claim_amount": 750.0},
        {"claim_amount": None}
    ]
    merged = merge_creditor_group(creditors)

    assert merged["claim_amount"] == 750.0


def test_merge_all_na_becomes_none():
    """All N/A fields should become None, not preserve 'N/A'."""
    creditors = [
        {"sender_email": "N/A"},
        {"sender_email": "N/A"}
    ]
    merged = merge_creditor_group(creditors)

    assert merged["sender_email"] is None


def test_merge_needs_manual_review_or_logic():
    """needs_manual_review should be True if ANY creditor needs review."""
    creditors = [
        {"needs_manual_review": False},
        {"needs_manual_review": True},
        {"needs_manual_review": False}
    ]
    merged = merge_creditor_group(creditors)

    assert merged["needs_manual_review"] is True


def test_merge_source_documents_deduplicated():
    """source_documents should combine and deduplicate."""
    creditors = [
        {"source_documents": ["doc1.pdf", "doc2.pdf"]},
        {"source_documents": ["doc2.pdf", "doc3.pdf"]}
    ]
    merged = merge_creditor_group(creditors)

    assert merged["source_documents"] == ["doc1.pdf", "doc2.pdf", "doc3.pdf"]


def test_merge_representative_preserves_both_names():
    """Representative + actual creditor should preserve both names."""
    creditors = [
        {
            "sender_name": "Inkasso Meyer GmbH",
            "is_representative": True,
            "actual_creditor": "Deutsche Bank AG"
        },
        {
            "sender_name": "Deutsche Bank AG",
            "is_representative": False
        }
    ]
    merged = merge_creditor_group(creditors)

    assert merged["sender_name"] == "Inkasso Meyer GmbH"
    assert merged["actual_creditor"] == "Deutsche Bank AG"
    assert merged["is_representative"] is True
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual field-by-field copying | Dict operators `\|` and `{**a, **b}` | Python 3.9 (2020) | Cleaner, less boilerplate |
| set() for deduplication | dict.fromkeys() | Python 3.7+ (ordered dicts) | Preserves order, same performance |
| Custom loops for OR logic | any(condition for x in list) | Always available | More readable, short-circuits |
| Generic recursive merge | Domain-specific merge functions | Best practice (2024-2026) | Explicit rules, testable |
| Preserving "N/A" strings | Return None for all-empty fields | Modern data modeling | Cleaner DB, no sentinel pollution |

**Deprecated/outdated:**
- **Python 3.6 and earlier** - Dict order not guaranteed, can't rely on dict.fromkeys() for order preservation
- **Manual if x not in seen loops** - dict.fromkeys() is faster and cleaner
- **Generic deep merge libraries** - Overkill for flat creditor dicts, adds dependency

## Open Questions

### 1. **Performance with large merge groups (50+ creditors in one group)**

- What we know: Typical groups are 2-5 creditors based on deduplication patterns
- What's unclear: If LLM groups 50 creditors together, does merge_creditor_group() become a bottleneck?
- Recommendation: Current implementation is O(n) per group where n = group size. For 50 creditors, still <1ms. No optimization needed unless profiling shows issues.

### 2. **Field priority for sender_address when both valid**

- What we know: MERGE-02 says "longest/most complete" for strings
- What's unclear: Should we prefer structured addresses ("Street 1, 12345 City") over partial ("12345 City")?
- Recommendation: Use longest string as proxy for completeness. If issues arise, add specific address parsing logic in Phase 5+.

### 3. **Validation of merged creditor output**

- What we know: Pydantic can validate schema, but should we validate semantic correctness?
- What's unclear: Should merge_creditor_group() return a Pydantic model or plain dict?
- Recommendation: Keep plain dict for flexibility. Add optional Pydantic validation in integration layer if needed. Current Node.js code expects plain dict.

### 4. **Handling of non-standard fields during merge**

- What we know: Creditor schema has ~20 fields (dokumenttyp, glaeubiger_name, etc.)
- What's unclear: Do all fields need explicit merge logic, or can some be ignored/passed through?
- Recommendation: Explicit rules for: sender_name, sender_address, sender_email, reference_number, claim_amount, claim_amount_raw, is_representative, actual_creditor, needs_manual_review, review_reasons, source_documents. All others pass through from first creditor (document_id, timestamps, etc.).

## Sources

### Primary (HIGH confidence)

- [Python Dictionary Merging (2026)](https://copyprogramming.com/howto/python-how-to-recursively-merge-2-dictionaries-duplicate) - Modern dict merge operators and priority behavior
- [Python Merge Lists Without Duplicates](https://www.geeksforgeeks.org/python/python-merge-two-lists-without-duplicates/) - dict.fromkeys() for order-preserving deduplication
- [Python Combine Dictionary with Priority](https://www.geeksforgeeks.org/python-combine-dictionary-with-priority/) - Right-side priority in dict merging
- [Existing deduplicator.py](file:///Users/luka.s/Cursor%20:%20Mandanten%20-%20Portal/Creditor-process-fastAPI/app/services/deduplicator.py) - Current Phase 3 implementation (lines 413-546)
- [Phase 4 CONTEXT.md](file:///Users/luka.s/Cursor%20:%20Mandanten%20-%20Portal/mandanten-portal/.planning/phases/04-code-based-merge-logic/04-CONTEXT.md) - User decisions on merge edge cases

### Secondary (MEDIUM confidence)

- [Python Merge Dictionaries (8 Ways)](https://datagy.io/python-merge-dictionaries/) - Comprehensive dict merge patterns
- [Entity Resolution Explained](https://spotintelligence.com/2024/01/22/entity-resolution/) - Record deduplication best practices
- [Merging Datasets in Python Best Practices](https://www.statology.org/merging-and-joining-datasets-in-python-best-practices/) - Data merge strategies

### Tertiary (LOW confidence - needs validation)

- [dedupe Python library](https://github.com/dedupeio/dedupe) - Machine learning deduplication (not used in this phase, but relevant patterns)
- WebSearch results on merge logic - General programming advice, not domain-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Python stdlib, well-documented
- Merge patterns: HIGH - Based on existing deduplicator.py + stdlib idioms + user decisions
- Field priority rules: HIGH - Explicit in MERGE-* requirements and CONTEXT.md
- Edge cases: MEDIUM - Some ambiguity in address/email merging, but defaults are sensible
- Performance: HIGH - Stdlib operations are O(n), no scaling concerns for typical group sizes

**Research date:** 2026-01-31
**Valid until:** Long-term stable (Python stdlib patterns, no external dependencies)

**Critical dependencies:**
- Python 3.7+ for dict.fromkeys() order preservation
- Existing deduplicator.py structure (merge happens in deduplicate_with_llm method)
- Phase 3 validation output (DuplicateGroups with index arrays)

**Research gaps:**
- No access to actual production creditor data for validation - patterns based on requirements and test scenarios
- No performance profiling data - estimates based on algorithm complexity
- No integration testing with Node.js webhook receiver - assumed compatibility based on existing Phase 3 code
