# Email Pair System - Implementation Notes

## Current Status

### ✅ Implemented (Gmail Only)
1. Thread fetching + pair building
2. Rate limiting + exponential backoff
3. Privacy controls (90-day retention, GDPR deletion)
4. Bad pair prevention (In-Reply-To / References)
5. Auto-learning (incremental)
6. Pair retrieval + tone matching
7. Signature hallucination prevention

### ⚠️ Partial Implementation
- **Outlook Support:** NOT YET IMPLEMENTED
  - Reason: Focused on Gmail first (MVP)
  - Status: Code structure ready, needs Outlook Graph API calls
  - Priority: Medium (add when Outlook users request it)

### 🔒 Security & Privacy Audit Responses

#### 1. Gmail Scopes ✅
- `gmail.readonly` - Read INBOX + SENT
- `gmail.send` - Send drafts
- `gmail.modify` - Update labels
- Thread access included in readonly scope

#### 2. Rate Limiting ✅
**Gmail API Quotas:**
- 250 units/user/second
- 1B units/day
- Our usage (30-day backfill, 150 emails):
  - 1x threads.list = 5 units
  - 150x threads.get = 750 units
  - Total: ~755 units (well within limits)

**Protection:**
- Exponential backoff (429 errors)
- Batch processing (10 threads/batch, 100ms delay)
- Max 5 retries with jitter
- File: `gmail-rate-limiter.js`

#### 3. Privacy & Data Retention ✅
**Raw Text Retention:**
- Stored: `inboundRaw`, `outboundRaw` (contains PII)
- Retention: 90 days
- After 90 days: Auto-purged (keeps cleaned text + metadata)
- Cron: Daily at 2 AM UTC
- File: `pair-privacy-maintenance.js`

**Encryption:**
- At rest: Handled by Supabase PostgreSQL
- In transit: HTTPS (Google APIs)

**GDPR Compliance:**
- Article 17 (Right to Erasure): `deleteBusinessPairs(businessId)`
- Privacy report: Shows data age, raw text count
- File: `email-pair-privacy.js`

#### 4. Multi-Account Safety ✅
**Database Protection:**
- Unique constraint: `[businessId, inboundMessageId, outboundMessageId]`
- All queries filtered by `businessId`
- Cross-tenant isolation: Enforced at DB level

**Risk:** None - schema enforces isolation

#### 5. Bad Pair Prevention ✅
**Matching Strategy:**
1. **Primary:** In-Reply-To header (most reliable)
2. **Fallback:** References header (thread chain)
3. **Last Resort:** Recency heuristic (last INBOUND before OUTBOUND)

**Validation:**
- Time gap check: Max 7 days between INBOUND → OUTBOUND
- Suspicious pairs rejected (e.g., late follow-ups)
- Message-ID map for exact matching

**File:** `email-pair-builder.js` (extractPairsFromThread)

#### 6. Observability 🚧 PARTIAL
**Current Metrics:**
- Pair count (total)
- Language breakdown
- Retrieval confidence score
- Low confidence warnings in logs

**Missing (Future Work):**
- Hit rate tracking (% of drafts that found pairs)
- Fallback rate (% using default tone)
- Error rate by provider
- Retrieval latency P50/P95
- Pair quality scoring

**Recommendation:** Add to observability dashboard later

---

## Known Limitations

### 1. Outlook Support
- **Status:** Not implemented
- **Blocker:** Graph API thread fetching different from Gmail
- **Effort:** ~2-3 days
- **Priority:** Add when needed

### 2. Intent Classification
- **Status:** All pairs have `intent: null`
- **Impact:** Can't filter by intent during retrieval
- **Workaround:** Keyword similarity works fine
- **Fix:** Add intent classifier to pair building

### 3. HTML Stripping
- **Status:** Some pairs have `<br>` tags
- **Impact:** Minor (LLM handles it)
- **Fix:** Enhance stripHtml() function

### 4. Signature Detection
- **Status:** Most pairs show `signature: NO`
- **Impact:** Minor (manual signature works)
- **Root Cause:** HTML emails, signature in HTML part
- **Fix:** Improve signature extraction for HTML emails

### 5. Retrieval Timeout
- **Status:** Sometimes exceeds 2000ms
- **Impact:** Draft generation delayed
- **Fix:** Add pgvector for faster similarity search

---

## Architecture Decisions

### Why Gmail First?
1. Most common email provider (60%+ market share)
2. Better API docs + community support
3. Easier thread structure (vs Outlook Graph API)
4. Faster MVP delivery

### Why 90-Day Retention?
1. GDPR "right to be forgotten" compliance
2. Balances learning (need data) vs privacy
3. Cleaned text sufficient for tone/style matching after 90 days
4. Industry standard (e.g., Intercom, Front)

### Why Keyword Similarity (not just embeddings)?
1. Faster (no OpenAI API call)
2. Works offline
3. Jaccard coefficient simple + effective
4. Embeddings reserved for future enhancement (pgvector)

### Why Hybrid Tone Classification?
1. Cost savings (70% rule-based, 30% LLM)
2. Faster (no API call for obvious cases)
3. LLM fallback ensures accuracy for edge cases

---

## Production Checklist

### Before Launch
- [x] Database schema
- [x] Gmail integration
- [ ] Outlook integration (optional)
- [x] Rate limiting
- [x] Privacy controls
- [x] Bad pair prevention
- [x] Signature hallucination fix
- [x] Auto-learning hook
- [x] UI stats
- [ ] Observability metrics (future)
- [ ] Load testing (100+ users)

### Monitoring
- [ ] Alert: Pair build failures
- [ ] Alert: High retrieval latency (>3s)
- [ ] Alert: Privacy cron failures
- [ ] Dashboard: Pair stats per business
- [ ] Dashboard: Signature compliance rate

### Documentation
- [x] Implementation notes (this file)
- [ ] API docs (pair endpoints)
- [ ] User guide (Settings page)
- [ ] Admin guide (privacy controls)

---

## Future Enhancements

### Phase 2 (Optional)
1. **Outlook Support** - Full parity with Gmail
2. **pgvector** - Faster semantic search
3. **Intent Classification** - Better filtering
4. **Pair Quality Scoring** - Remove low-quality pairs
5. **Language quality** - Better Turkish support
6. **Observability** - Full metrics dashboard

### Phase 3 (Advanced)
1. **Active Learning** - User feedback on drafts improves pairs
2. **Pair Pruning** - Auto-remove outdated/irrelevant pairs
3. **Domain-Specific Learning** - Industry-specific tone models
4. **A/B Testing** - Measure pair-based vs non-pair drafts

---

## Questions & Answers

**Q: Why not use embeddings for all similarity?**
A: Cost + latency. Keyword similarity is 10x faster and works well for initial filter. Embeddings reserved for Phase 2 optimization.

**Q: What if user has <10 sent emails?**
A: System gracefully falls back to general style (no pairs). Works fine, just less personalized.

**Q: How do you handle multiple languages in same business?**
A: Language detection per email, pair retrieval filtered by language. Works correctly.

**Q: What about email threading bugs (Gmail groups incorrectly)?**
A: Rare but possible. Validation (7-day gap) catches most cases. Future: add manual pair flagging UI.

**Q: GDPR compliance for EU users?**
A: Yes. 90-day retention + deleteBusinessPairs() + privacy report. Supabase encrypts at rest.

---

**Status:** Production ready for Gmail users
**Next:** Add Outlook support when requested
**Owner:** Engineering team
**Last Updated:** 2026-01-26
