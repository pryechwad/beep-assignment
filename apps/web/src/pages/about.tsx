import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout';
import { Badge, Card } from '@/components/ui/primitives';
import { DataTable, LoadingRows } from '@/components/ui/states';
import { useOverview, useSourceStatus } from '@/hooks/queries';
import { fmtNumber, fmtRelative, sourceLabel } from '@/lib/format';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-line py-6 last:border-0">
      <h2 className="mb-2 text-[0.9375rem] font-semibold text-ink">{title}</h2>
      <div className="max-w-3xl space-y-2.5 text-[0.8125rem] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

export default function About() {
  const sources = useSourceStatus();
  const overview = useOverview();
  const total = overview.data?.totals.activeJobs;
  return (
    <div>
      <PageHeader title="Methodology & data transparency" description="How opportunities are discovered, cleaned, classified and checked — and where the data falls short." />
      <Card className="px-6">
        <Section id="sources" title="1. Where the data comes from">
          <p>
            Every posting is fetched live from an employer’s <strong>public</strong> applicant-tracking-system job board: the Greenhouse Job Board API, the Lever Postings API and the Ashby Job Posting API. These are
            official endpoints published for exactly this purpose. We respect robots.txt, rate-limit every source, never log in, and never bypass CAPTCHAs or anti-bot measures.
          </p>
          <p>
            Most boards are global, so only postings whose location names India (a city, a state or the country) are kept. A bare “Remote” with no country is not counted as India. No posting is ever created, padded or
            generated to reach a number{total !== undefined ? <> — the index currently holds <strong className="tabular">{fmtNumber(total)}</strong> real, active, unique postings</> : null}.
          </p>
          <p>
            <strong>Known limitation:</strong> coverage is limited to companies that publish on these three platforms. Large Indian employers that use Workday, SuccessFactors, Naukri or proprietary portals are not
            included, so the index skews towards technology companies and Bengaluru. Mass-recruiting service companies (campus drives) are under-represented.
          </p>
        </Section>
        <Section id="normalisation" title="2. Normalisation">
          <p>
            Company names, titles, locations (Bangalore → Bengaluru, Gurgaon → Gurugram, Bombay → Mumbai), employment types, work modes, dates and URLs are normalised by deterministic, unit-tested code. The original
            values are always kept alongside the normalised ones and shown on each job page as “source facts”. Anything a source does not state stays empty — salary, city and experience are never inferred.
          </p>
        </Section>
        <Section id="dedup" title="3. Duplicate detection">
          <p>
            Three layers: identical source id or canonical URL; identical company + title + city; and fuzzy/semantic similarity of title, location and description. Cross-posted copies on different sources are merged
            into one opening while keeping every source reference. Two different listings on the <em>same</em> board are never merged automatically — the employer says they are separate openings — and near-identical pairs
            are sent to human review instead.
          </p>
        </Section>
        <Section id="classification" title="4. AI classification">
          <p>
            Each posting is first classified by transparent rules (title keywords, explicitly stated years of experience, “freshers welcome” statements). Senior roles with a clear discipline stop there. Every potentially
            early-career posting is then sent to an LLM with a versioned prompt that must return structured JSON. The output is validated, every quoted piece of evidence is checked to appear verbatim in the posting, and
            anything not found (a city, a salary, a skill) is discarded.
          </p>
          <p>
            Confidence is <strong>not</strong> the model’s self-reported certainty. It combines agreement between rules and the model, whether evidence was found in the text, and whether validation needed repairs. Low-confidence
            results are queued for human review, and the accuracy of each confidence level is measured on a hand-labelled sample.
          </p>
          <p>
            <strong>Current limitation:</strong> LLM capacity is rate-limited by the provider’s quota, so part of the index may show a rules-only result (marked as pending) until the AI pass reaches it. Those postings are still
            searchable and their source facts are complete.
          </p>
        </Section>
        <Section id="freshness" title="5. Freshness">
          <p>
            A scheduler runs the full pipeline every morning at 06:30 IST. A posting that disappears from every source that listed it is marked closed. Original posting links are re-checked every six hours. Always apply on
            the employer’s site — the “Apply” button links straight to the original listing.
          </p>
        </Section>
        <Section id="source-list" title="6. Sources and their health">
          {sources.isPending ? (
            <LoadingRows rows={4} />
          ) : (
            <div className="-mx-4 rounded-lg border border-line">
              <DataTable
                caption="Sources"
                rows={sources.data?.items ?? []}
                rowKey={(s) => s.id}
                columns={[
                  { key: 'name', header: 'Board', cell: (s) => <span className="text-ink">{s.company ?? s.name}</span> },
                  { key: 'type', header: 'Platform', cell: (s) => sourceLabel(s.adapterType) },
                  { key: 'jobs', header: 'Active in index', align: 'right', cell: (s) => fmtNumber(s.activeJobs) },
                  { key: 'sync', header: 'Last success', cell: (s) => <span className="text-muted">{fmtRelative(s.lastSuccessAt)}</span> },
                  { key: 'health', header: 'Status', cell: (s) => (!s.enabled ? <Badge tone="outline">Disabled</Badge> : s.healthy === false ? <Badge tone="danger">Failing</Badge> : s.healthy ? <Badge tone="success">Healthy</Badge> : <Badge tone="outline">Not yet run</Badge>) },
                ]}
              />
            </div>
          )}
        </Section>
      </Card>
    </div>
  );
}
