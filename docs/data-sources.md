# Data sources

All opportunities come from **official, public, unauthenticated job-board APIs** published by applicant-tracking systems for exactly this use (embedding a company's job list). Nothing is generated, padded or inferred to reach a target count.

| Platform | Endpoint (verified 2026-11-20) | Pagination | robots.txt |
|---|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | none (full board) | `Disallow: /embed/` only — API path allowed |
| Lever | `GET https://api.lever.co/v0/postings/{token}?mode=json&skip=N&limit=100` | skip/limit | `Allow: /`, crawl-delay 1 |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true` | none (full board) | returns 401 → treated as "no restrictions" per RFC 9309 §2.3.1.3 |

Each adapter validates the payload with a Zod schema of only the fields it relies on; a record that fails validation is skipped and logged (e.g. one OpenAI posting with an empty title on 2026-11-20), never guessed at.

## Rules we follow

- `User-Agent: BeepJobIntelligenceBot/0.1 (+public job board aggregation; respects robots.txt)`
- robots.txt is fetched and cached per origin (6 h); disallowed paths are not requested; an unreachable robots.txt (5xx/network) is treated as *disallow*.
- Per-source rate limit (default 30 requests/min, configurable per source) plus exponential backoff and `Retry-After`.
- No logins, cookies, CAPTCHA solving, headless-browser evasion or scraping of HTML pages that the provider serves an API for. Playwright is used only for our own end-to-end tests.
- Apply links always point to the employer's original posting.

## India filter

Boards are global; a posting is kept if any of its locations positively identifies India — an Indian city, an Indian state, or the word India. Structured country fields (Lever `country: "IN"`, Ashby `addressCountry`) are translated into an explicit "India" location. A bare "Remote" with no country is **not** counted as India. Two-letter codes are not trusted on their own: on live data "Lafayette, IN" (Indiana) and "Nashville, TN" (Tennessee) were initially mis-read as India — fixed and covered by regression tests.

## Registry

The 40 configured boards live in `packages/database/src/source-registry.ts` (seeded into `JobSource`). Admins can enable/disable a board, change its rate limit, or sync it on demand. Per-source health (last success/failure, error, records seen) is recorded every run.

## Coverage on 2026-11-20 (first full run)

| | |
|---|---|
| Boards fetched successfully | 40 / 40 |
| Postings fetched (all countries) | 7,479 |
| India-located, after filter | 1,010 raw records |
| Unique canonical jobs | **1,010** (cross-source duplicates: 0; same-source near-duplicates flagged for review: 20) |
| Companies with active jobs | 38 |
| Cities | 49 |

The 200+ unique postings target is met with real data (1,010).

## Known limitations

- Only employers that publish on Greenhouse, Lever or Ashby are covered. Large Indian employers on Workday, SuccessFactors, Taleo, Naukri RMS or bespoke portals (most IT-services firms and mass campus recruiters) are absent, so the index skews to product/tech companies and to Bengaluru (≈60% of postings).
- Fresher-specific job boards (Internshala, Naukri, LinkedIn) are not used: they either prohibit automated access in their terms or require authentication.
- Many global boards list few India roles; the yield per board varies from 0 (Mozilla, Perplexity on the day of the run) to 190 (Paytm).

### Adding a source

1. Verify the public endpoint and robots.txt manually.
2. Add an entry to `SOURCE_REGISTRY` (adapter type + board token + display name) and run `npm run db:seed`.
3. For a new platform, implement `BaseAdapter` (`endpoint`, `parse`, `toRawJob`) in `packages/scraper-engine/src/adapters`, register it in `ADAPTERS`, add the enum value and a unit test with a recorded payload shape.
