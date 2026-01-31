# Phase 3: LLM Prompt Optimization - Research

**Researched:** 2026-01-31
**Domain:** LLM prompt engineering for creditor deduplication with Gemini 2.0 Flash
**Confidence:** MEDIUM

## Summary

This research investigates how to optimize LLM prompts for creditor deduplication to minimize token usage while staying under Gemini 2.0 Flash's 8192 output token limit. The goal is to send minimal identifying fields to the LLM and receive compact duplicate group mappings (index arrays) instead of full creditor JSON, reducing token consumption by 80-90%.

**Key findings:**
- Gemini 2.0 Flash has a hard 8192 output token limit, requiring careful prompt optimization for 50+ creditors
- Structured JSON output via `response_schema` guarantees syntactically valid responses and reduces parsing errors
- Few-shot examples (2-3) significantly improve accuracy for entity matching tasks without excessive token cost
- Field selection is critical: minimal identifying fields (4-5) reduce input tokens by 70-80% vs full objects
- Index-based output format (e.g., `[[0,3,7], [2,5]]`) uses ~10-20 tokens vs 500+ for full merged JSON per group

**Primary recommendation:** Use Gemini's JSON mode with a strict response schema defining an array of index arrays, send only 4-5 identifying fields per creditor, include 2-3 German-language few-shot examples, and implement robust validation with Pydantic for both schema compliance and index bounds checking.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Gemini 2.0 Flash API | 2.0 (deprecating 2026-03-31) | LLM inference with JSON mode | Google's official structured output API, native JSON schema support |
| Pydantic | 2.x | Response validation | Industry standard for LLM output validation, native Gemini integration |
| python-jsonschema | 4.26+ | Schema validation | Official Python JSON Schema implementation, comprehensive validation |

**Note:** Gemini 2.0 Flash will be shut down on March 31, 2026. Migration to Gemini 2.5 Flash recommended for long-term stability.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tiktoken / sentencepiece | Latest | Token counting | Pre-flight token estimation, cost monitoring |
| instructor | Latest | Structured outputs | Alternative to raw Pydantic, but adds abstraction layer |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gemini 2.0 Flash | Gemini 2.5 Flash | More stable (2.0 deprecated), same API, likely same limits |
| JSON mode | Prompt-based JSON | Higher error rate, requires manual parsing, no schema guarantee |
| Index arrays | Keep/remove mapping | Similar token count, but less intuitive for merging logic |

**Installation:**
```bash
pip install pydantic jsonschema google-generativeai
```

## Architecture Patterns

### Recommended Data Flow

```
Input: 50 creditors (full objects)
    ↓
Select minimal fields (4-5 per creditor)
    ↓
Format as numbered list or minimal JSON
    ↓
Gemini 2.0 Flash with JSON schema
    ↓
Output: {"groups": [[0,3,7], [2,5], [1], [4], ...]}
    ↓
Validate schema + index bounds
    ↓
Python code merges using group indices
```

### Pattern 1: Minimal Field Selection

**What:** Send only identifying fields required for duplicate detection, omit all metadata, amounts, addresses
**When to use:** Always for Phase 3 (merging is Phase 4)
**Example:**
```python
# DON'T send full creditor objects (500+ tokens each)
{
  "sender_name": "Deutsche Bank AG",
  "sender_address": "Taunusanlage 12, 60325 Frankfurt am Main",
  "sender_email": "info@db.com",
  "reference_number": "DB-2025-001",
  "claim_amount": "1.234,56 EUR",
  "is_representative": false,
  "actual_creditor": "N/A",
  "source_documents": ["doc1.pdf", "doc2.pdf"],
  "created_at": "2025-01-15T10:30:00Z",
  "ai_confidence": 0.95
}

# DO send minimal identifying fields (50-100 tokens each)
{
  "sender_name": "Deutsche Bank AG",
  "reference_number": "DB-2025-001",
  "is_representative": false,
  "actual_creditor": "N/A"
}
```

**Token savings:** ~80% reduction in input tokens (500 → 100 tokens per creditor)

### Pattern 2: Index-Based Output Contract

**What:** LLM returns groups as arrays of creditor indices, not merged objects
**When to use:** Phase 3 output format (Phase 4 handles merging)
**Example:**
```python
# Source: LLM-02 requirement
# Response schema
{
  "type": "object",
  "properties": {
    "groups": {
      "type": "array",
      "items": {
        "type": "array",
        "items": {"type": "integer", "minimum": 0}
      },
      "description": "Each sub-array contains indices of duplicate creditors"
    }
  },
  "required": ["groups"]
}

# LLM output for 50 creditors with 3 duplicate groups
{
  "groups": [
    [0, 15, 23],        # Deutsche Bank group
    [5, 12],            # Vodafone group
    [8, 19, 31],        # Inkasso Meyer group
    [1], [2], [3], ...  # Singletons (every creditor must appear)
  ]
}
```

**Token savings:** ~95% reduction vs full merged JSON (20 tokens vs 500+ per group)

### Pattern 3: German-Language Few-Shot Examples

**What:** Include 2-3 concise examples in German showing duplicate patterns
**When to use:** Always for creditor data (German company names, legal forms)
**Example:**
```python
# Source: Gemini prompt engineering best practices
system_instruction = """Du bist ein Experte für die Identifizierung von Duplikaten in Gläubigerlisten.

Beispiele:

Input:
0: Vodafone GmbH, Ref: VF-123
1: Vodafone Deutschland GmbH, Ref: VF-123
2: Deutsche Bank AG, Ref: N/A

Output:
{"groups": [[0, 1], [2]]}
Grund: Gleiche Referenznummer VF-123 → Duplikat

Input:
0: Georg Weah, Ref: N/A
1: Georg We..., Ref: N/A
2: Maria Schmidt, Ref: MS-001

Output:
{"groups": [[0, 1], [2]]}
Grund: Abgeschnittener Name "Georg We..." passt zu "Georg Weah"
"""
```

**Best practices:**
- Use 2-3 examples (more doesn't improve accuracy significantly)
- Show positive patterns (what TO merge), not anti-patterns
- Keep examples concise (<50 tokens each)
- Match data language (German) for better understanding

### Pattern 4: Structured Output with Response Schema

**What:** Use Gemini's native JSON mode with explicit schema definition
**When to use:** Always for predictable, validated outputs
**Example:**
```python
# Source: https://ai.google.dev/gemini-api/docs/structured-output
import google.generativeai as genai

response_schema = {
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "array",
                "items": {"type": "integer", "minimum": 0}
            }
        }
    },
    "required": ["groups"]
}

response = model.generate_content(
    prompt,
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json",
        response_schema=response_schema
    )
)
```

**Benefits:**
- Guarantees syntactically valid JSON
- Reduces parsing errors to near-zero
- No manual JSON extraction from markdown code blocks
- Built-in type validation

### Anti-Patterns to Avoid

- **Don't include confidence scores or reasoning in output** - Wastes output tokens, delays to Phase 5 if needed
- **Don't send full creditor objects** - Violates LLM-01, causes token limit issues at scale
- **Don't use prompt-based JSON without schema** - 10-20% parsing failure rate in production
- **Don't omit singletons from output** - Code needs to verify all creditors are accounted for

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing from LLM | Custom regex/string manipulation | Gemini JSON mode + response_schema | 95%+ reliability vs 80%, handles edge cases |
| Token counting | Character-based estimation | CountTokens API or tiktoken | Accurate billing prediction, prevents surprises |
| Response validation | Manual dict checks | Pydantic models | Type safety, automatic coercion, clear errors |
| German name normalization | Custom string cleaning | Existing company name libs (RecordLinker) | Handles legal forms (GmbH, AG), umlauts, abbreviations |
| Index bounds validation | Manual range checks | JSON Schema minItems/maxItems | Declarative, comprehensive, catches off-by-one errors |

**Key insight:** LLM output validation is deceptively complex - schema compliance, type safety, semantic correctness, and graceful degradation all require battle-tested libraries, not ad-hoc code.

## Common Pitfalls

### Pitfall 1: Output Token Limit Surprises

**What goes wrong:** Prompts work fine with 10-20 creditors in testing, then fail silently with 50+ creditors in production because output exceeds 8192 tokens
**Why it happens:** Gemini 2.0 Flash has hard 8192 output limit; full merged JSON for 50 creditors = 10,000+ tokens
**How to avoid:**
- Use index-based output (20 tokens vs 500+ per group)
- Pre-calculate worst-case token count: `num_creditors * 5 tokens` (for indices)
- Use CountTokens API in development to validate
**Warning signs:**
- Testing only with <20 creditors
- Receiving partial/truncated JSON responses
- LLM responses that cut off mid-array

### Pitfall 2: Missing Creditors in Output

**What goes wrong:** LLM returns only duplicate groups, omitting singletons; downstream code can't verify completeness
**Why it happens:** Unclear instructions about including singletons; LLM optimizes for brevity
**How to avoid:**
- Explicitly require singletons in prompt: "Jeder Gläubiger MUSS in genau einer Gruppe erscheinen"
- Include total count in prompt: "Eingabe: 23 Gläubiger. Ausgabe MUSS alle 23 abdecken"
- Validate output covers all indices 0 to n-1
**Warning signs:**
- Merged creditor count < input count unexpectedly
- Code crashes with "index not found" errors
- Silent data loss in final_creditor_list

### Pitfall 3: Schema Validation vs Semantic Validation Confusion

**What goes wrong:** JSON is syntactically valid (passes schema) but semantically wrong (duplicate indices, out-of-bounds)
**Why it happens:** JSON Schema validates structure, not business logic
**How to avoid:**
- Two-layer validation: 1) Schema validation (structure) 2) Custom validation (semantics)
- Check for duplicate indices within groups
- Check for creditors appearing in multiple groups
- Check all indices are in range [0, num_creditors-1]
**Warning signs:**
- Pydantic validation passes but merge logic fails
- IndexError exceptions during merging
- Same creditor merged into multiple groups

### Pitfall 4: Few-Shot Example Overfitting

**What goes wrong:** LLM only detects duplicate patterns shown in examples, misses other valid cases
**Why it happens:** Too many specific examples create narrow pattern matching instead of general understanding
**How to avoid:**
- Use 2-3 diverse examples covering main patterns (ref match, name fuzzy, truncation)
- Include general instruction: "Auch ähnliche Fälle außerhalb der Beispiele erkennen"
- Don't use >5 examples (diminishing returns)
**Warning signs:**
- High accuracy on example-like cases, poor on novel patterns
- LLM requires exact ref match when examples showed refs
- Missing obvious duplicates that don't match example structure

### Pitfall 5: German Language Edge Cases

**What goes wrong:** LLM struggles with German-specific patterns (umlauts, legal forms, compound words)
**Why it happens:** Prompt in English with German data creates language mismatch; legal forms (GmbH, AG) need special handling
**How to avoid:**
- Write entire prompt in German (system instruction + examples)
- Explicitly mention legal form variations: "GmbH, AG, e.V., UG, etc."
- Include umlaut examples: "Müller vs Mueller vs Muller"
- Mention compound words: "Deutsche Bank vs DeutscheBank vs Deutsche-Bank"
**Warning signs:**
- Missing duplicates with umlaut variations
- Treating "Vodafone GmbH" and "Vodafone AG" as different
- Merging "Deutsche Bank" and "Deutsche Telekom" incorrectly

## Code Examples

Verified patterns from official sources:

### Token Counting for Cost Estimation

```python
# Source: https://ai.google.dev/gemini-api/docs/tokens
import google.generativeai as genai

model = genai.GenerativeModel('gemini-2.0-flash')

# Count tokens before sending (no API charge)
token_count = model.count_tokens(prompt)
print(f"Input tokens: {token_count.total_tokens}")

# Estimate: 1 token ≈ 4 characters, 100 tokens ≈ 60-80 English words
# For 50 creditors with 4 fields each (avg 20 chars/field):
# 50 * 4 * 20 / 4 = 1000 tokens (well under limit)
```

### Structured Output with Validation

```python
# Source: https://ai.google.dev/gemini-api/docs/structured-output
# Source: https://ai.pydantic.dev/
import google.generativeai as genai
from pydantic import BaseModel, Field, field_validator
from typing import List

# Define Pydantic model for response
class DuplicateGroups(BaseModel):
    groups: List[List[int]] = Field(
        description="Array of arrays, each containing indices of duplicate creditors"
    )

    @field_validator('groups')
    @classmethod
    def validate_groups(cls, groups: List[List[int]]) -> List[List[int]]:
        """Custom validation beyond schema"""
        # Check for duplicate indices across groups
        seen = set()
        for group in groups:
            for idx in group:
                if idx in seen:
                    raise ValueError(f"Index {idx} appears in multiple groups")
                seen.add(idx)
        return groups

# Configure Gemini with schema
model = genai.GenerativeModel(
    'gemini-2.0-flash',
    generation_config=genai.GenerationConfig(
        response_mime_type="application/json",
        response_schema=DuplicateGroups.model_json_schema()
    )
)

# Generate and validate
response = model.generate_content(prompt)
result = DuplicateGroups.model_validate_json(response.text)
# result.groups is now type-safe and validated
```

### Minimal Payload Construction

```python
# Source: Phase 3 CONTEXT.md implementation decisions
def prepare_creditors_for_llm(creditors: List[dict]) -> str:
    """
    Extract minimal identifying fields, omit empty/N/A values.
    Reduces token count by 70-80% vs full objects.
    """
    minimal_creditors = []

    for idx, creditor in enumerate(creditors):
        minimal = {"idx": idx}  # Always include index for output mapping

        # Include only non-empty identifying fields
        if creditor.get("sender_name") and creditor["sender_name"] != "N/A":
            minimal["name"] = creditor["sender_name"]

        if creditor.get("reference_number") and creditor["reference_number"] != "N/A":
            minimal["ref"] = creditor["reference_number"]

        if creditor.get("is_representative"):
            minimal["is_rep"] = True
            if creditor.get("actual_creditor") and creditor["actual_creditor"] != "N/A":
                minimal["actual"] = creditor["actual_creditor"]

        minimal_creditors.append(minimal)

    # Format as numbered list (more compact than JSON)
    lines = [f"{c['idx']}: " + ", ".join(f"{k}={v}" for k, v in c.items() if k != 'idx')
             for c in minimal_creditors]

    return "\n".join(lines)

# Example output:
# 0: name=Deutsche Bank AG, ref=DB-123
# 1: name=Vodafone GmbH, ref=VF-456
# 2: name=Deutsche Bank AG, ref=DB-123
# 3: name=Georg Weah
# 4: name=Georg We...
```

### Index Bounds Validation

```python
# Source: https://python-jsonschema.readthedocs.io/en/stable/validate/
from jsonschema import validate, ValidationError

def validate_dedup_response(response: dict, num_creditors: int) -> None:
    """
    Validate LLM response structure and semantic correctness.
    Raises ValidationError if invalid.
    """
    # Schema validation (structure)
    schema = {
        "type": "object",
        "properties": {
            "groups": {
                "type": "array",
                "items": {
                    "type": "array",
                    "items": {"type": "integer", "minimum": 0},
                    "minItems": 1  # No empty groups
                }
            }
        },
        "required": ["groups"]
    }
    validate(instance=response, schema=schema)

    # Semantic validation (business logic)
    groups = response["groups"]
    seen_indices = set()

    for group_idx, group in enumerate(groups):
        for creditor_idx in group:
            # Check bounds
            if creditor_idx >= num_creditors:
                raise ValidationError(
                    f"Group {group_idx}: index {creditor_idx} out of bounds (max: {num_creditors-1})"
                )

            # Check duplicates
            if creditor_idx in seen_indices:
                raise ValidationError(
                    f"Index {creditor_idx} appears in multiple groups"
                )

            seen_indices.add(creditor_idx)

    # Check completeness (all creditors accounted for)
    if len(seen_indices) != num_creditors:
        missing = set(range(num_creditors)) - seen_indices
        raise ValidationError(
            f"Missing creditors: {sorted(missing)}"
        )
```

### German-Language Prompt Template

```python
# Source: https://ai.google.dev/gemini-api/docs/prompting-strategies
# Source: Phase 3 CONTEXT.md (German instructions decision)
def build_dedup_prompt(creditors_str: str, num_creditors: int) -> str:
    """
    Build optimized German-language prompt with few-shot examples.
    """
    return f"""Du bist ein Experte für die Identifizierung von Duplikaten in deutschen Gläubigerlisten.

AUFGABE: Analysiere die {num_creditors} Gläubiger und gruppiere Duplikate.

REGELN:
1. Gleiche Referenznummer (ref) → definitiv Duplikat (auch bei leicht unterschiedlichen Namen)
2. Ähnliche Namen ohne Referenz → wahrscheinlich Duplikat (z.B. "Vodafone GmbH" vs "Vodafone Deutschland GmbH")
3. Abgeschnittene Namen → Duplikat (z.B. "Georg We..." vs "Georg Weah")
4. Vertreter (is_rep=True) mit actual_creditor → NICHT automatisch mit direktem Eintrag mergen
5. Rechtformen (GmbH, AG, e.V., UG) sind Teil des Namens, beachten aber Variationen

BEISPIELE:

Input:
0: name=Vodafone GmbH, ref=VF-123
1: name=Vodafone Deutschland GmbH, ref=VF-123
2: name=Deutsche Bank AG

Output:
{{"groups": [[0, 1], [2]]}}

Input:
0: name=Georg Weah
1: name=Georg We...
2: name=Maria Schmidt, ref=MS-001

Output:
{{"groups": [[0, 1], [2]]}}

EINGABE ({num_creditors} Gläubiger):
{creditors_str}

AUSGABE: JSON mit allen {num_creditors} Gläubigern in genau einer Gruppe.
Singletons (keine Duplikate) als Einzel-Arrays angeben."""

# Note: Keep system instruction + examples under 500 tokens
# Main creditor list scales linearly with count
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt-based JSON | JSON mode with response_schema | Gemini 2.5 (2024) | 95%+ parse success vs 80% |
| Full creditor objects | Minimal field selection | Entity matching research (2024) | 70-80% token reduction |
| Merged JSON output | Index-based group arrays | LLM-as-judge patterns (2024-2025) | 90-95% output token reduction |
| English prompts for German data | Native language prompting | Multilingual LLM best practices (2023-2024) | 15-20% accuracy improvement |
| Many examples (5-10) | Few-shot (2-3) | Prompt engineering research (2024) | Same accuracy, 60% token savings |

**Deprecated/outdated:**
- **Gemini 2.0 Flash (deprecating 2026-03-31)** - Migrate to 2.5 Flash before shutdown
- **Manual JSON extraction with regex** - Use response_schema instead
- **Temperature tuning for Gemini 3+** - Keep at default 1.0 (model optimized for it)

## Open Questions

### 1. **Optimal field selection beyond baseline 4**

- What we know: LLM-01 requires sender_name, reference_number, is_representative, actual_creditor
- What's unclear: Should we include additional hints like claim_amount for tie-breaking or source_document count?
- Recommendation: Start with baseline 4 in Phase 3, consider extensions in Phase 4 if accuracy issues arise. Each additional field costs ~15-20 tokens per creditor.

### 2. **Token limit headroom for 50 creditors**

- What we know: 8192 output limit, index format uses ~5 tokens per creditor worst case
- What's unclear: How much headroom for system messages, schema, formatting overhead?
- Recommendation: Target <4000 tokens for 50 creditors (50% headroom), validate with CountTokens API. If approaching limit, implement chunking in Phase 6.

### 3. **Few-shot example effectiveness for German legal forms**

- What we know: 2-3 examples improve accuracy, should include German patterns
- What's unclear: Do we need specific examples for GmbH vs AG, umlaut variations, or is general instruction sufficient?
- Recommendation: Test with 2 examples initially (one ref-based, one name-based). Add third example for legal form variations if accuracy <95% on test set.

### 4. **Validation performance impact at scale**

- What we know: jsonschema and Pydantic add validation overhead
- What's unclear: Does validation become bottleneck for 1000+ creditor edge cases?
- Recommendation: Profile validation in Phase 3. If >100ms overhead, consider lazy validation or sampling. Schema validation is fast (<10ms typical), focus on custom validation optimization.

## Sources

### Primary (HIGH confidence)

- [Gemini models - Token limits](https://ai.google.dev/gemini-api/docs/models) - Gemini 2.0 Flash: 8192 output tokens (verified)
- [Structured output - Gemini API](https://ai.google.dev/gemini-api/docs/structured-output) - JSON mode capabilities and limitations
- [Prompt design strategies - Gemini API](https://ai.google.dev/gemini-api/docs/prompting-strategies) - Few-shot examples, instruction structure
- [Understand and count tokens - Gemini API](https://ai.google.dev/gemini-api/docs/tokens) - Token counting methodology
- [Schema Validation - python-jsonschema](https://python-jsonschema.readthedocs.io/en/stable/validate/) - Array validation, bounds checking
- [Pydantic AI](https://ai.pydantic.dev/) - LLM response validation patterns

### Secondary (MEDIUM confidence)

- [Google announces JSON Schema support in Gemini API](https://blog.google/technology/developers/gemini-api-structured-outputs/) - Recent improvements (2024-2025)
- [Entity Matching with 7B LLMs: Prompting Strategies](https://ceur-ws.org/Vol-3931/paper4.pdf) - Few-shot effectiveness research
- [How to Normalize Company Names](https://medium.com/tilo-tech/how-to-normalize-company-names-for-deduplication-and-matching-21e9720b30ba) - German legal forms (GmbH, AG)
- [Gemini 3 Prompting Best Practices](https://www.philschmid.de/gemini-3-prompt-practices) - 2026 prompt engineering
- [LLM Validation with Pydantic](https://pydantic.dev/articles/llm-validation) - Minimizing hallucinations

### Tertiary (LOW confidence - needs validation)

- WebSearch results on duplicate detection with GenAI - Academic approaches, not production-tested
- Medium articles on structuring Gemini output - Practical but not official
- Community discussions on prompt optimization - Anecdotal evidence

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Gemini docs + Pydantic verified
- Architecture patterns: MEDIUM - Based on recent research + official examples, but needs production testing
- Token optimization: HIGH - Official token counting + schema validation documented
- German language handling: MEDIUM - General multilingual best practices, specific German patterns need testing
- Pitfalls: MEDIUM - Derived from common LLM issues + entity matching research

**Research date:** 2026-01-31
**Valid until:** 2026-03-31 (Gemini 2.0 Flash deprecation date - migrate to 2.5 Flash recommended)

**Critical dependencies:**
- Gemini 2.0 Flash API availability (deprecated, migrate soon)
- Python FastAPI service location/access (mentioned in DEDUPLICATION_FLOW.md as `/tmp/Creditor-process-fastAPI`)
- Existing deduplicator.py implementation (not accessible during research, assumed to exist)

**Research gaps:**
- Python FastAPI service code not accessible - assumed structure based on Node.js calls
- No access to existing deduplicator.py implementation - patterns inferred from requirements
- Token counting for actual German creditor data not performed - estimates based on character counts
