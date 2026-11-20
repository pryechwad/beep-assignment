import { EMPLOYMENT_LABELS, EMPLOYMENT_TYPES, EXPERIENCE_LABELS, EXPERIENCE_LEVELS, ROLE_CATEGORIES, ROLE_LABELS, type EmploymentType, type ExperienceLevel, type RoleCategory } from '@beep/shared';
import { Check, ExternalLink, GitMerge, Split } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Select, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { Badge, Card, Input, Meta } from '@/components/ui/primitives';
import { DataTable, EmptyState, ErrorState, LoadingRows, Pagination } from '@/components/ui/states';
import { useDuplicates, useReclassify, useReviewClassification, useReviewDuplicate, useReviewQueue, type ReviewItem } from '@/hooks/admin';
import { expLabel, fmtNumber, fmtRelative, roleLabel } from '@/lib/format';

function OverrideDialog({ item, onClose }: { item: ReviewItem | null; onClose: () => void }) {
  const review = useReviewClassification();
  const [role, setRole] = useState<RoleCategory | undefined>();
  const [exp, setExp] = useState<ExperienceLevel | undefined>();
  const [emp, setEmp] = useState<EmploymentType | 'NONE' | undefined>();
  const [elig, setElig] = useState<'yes' | 'no' | undefined>();
  const [note, setNote] = useState('');
  if (!item) return null;
  const save = () =>
    review.mutate(
      { id: item.id, action: 'override', roleCategory: role, experienceLevel: exp, employmentType: emp === undefined ? undefined : emp === 'NONE' ? null : emp, isFresherEligible: elig === undefined ? undefined : elig === 'yes', note: note || undefined },
      { onSuccess: onClose },
    );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Correct classification" description={`${item.job.company.name} — ${item.job.title}`} footer={<><Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button><Button size="sm" variant="primary" onClick={save} loading={review.isPending}>Save as manual version</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-2">Role<Select label="Role" value={role ?? item.roleCategory} onValueChange={(v) => setRole(v as RoleCategory)} options={ROLE_CATEGORIES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} className="mt-1 w-full" /></label>
        <label className="text-xs text-ink-2">Experience<Select label="Experience" value={exp ?? item.experienceLevel} onValueChange={(v) => setExp(v as ExperienceLevel)} options={EXPERIENCE_LEVELS.map((r) => ({ value: r, label: EXPERIENCE_LABELS[r] }))} className="mt-1 w-full" /></label>
        <label className="text-xs text-ink-2">Employment<Select label="Employment" value={emp ?? item.employmentType ?? 'NONE'} onValueChange={(v) => setEmp(v as EmploymentType | 'NONE')} options={[{ value: 'NONE', label: 'Not stated' }, ...EMPLOYMENT_TYPES.map((r) => ({ value: r, label: EMPLOYMENT_LABELS[r] }))]} className="mt-1 w-full" /></label>
        <label className="text-xs text-ink-2">Fresher-eligible<Select label="Fresher-eligible" value={elig ?? (item.isFresherEligible ? 'yes' : 'no')} onValueChange={(v) => setElig(v as 'yes' | 'no')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} className="mt-1 w-full" /></label>
        <label className="text-xs text-ink-2 sm:col-span-2">Reviewer note<Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the model was wrong (optional)" className="mt-1" /></label>
      </div>
      <p className="mt-3 text-2xs text-muted">The model’s prediction is kept as history; this creates version {item.version + 1} with method MANUAL.</p>
    </Dialog>
  );
}

function ReviewTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'pending' | 'reviewed'>('pending');
  const [editing, setEditing] = useState<ReviewItem | null>(null);
  const q = useReviewQueue(page, status);
  const review = useReviewClassification();
  const reclassify = useReclassify();
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="text-xs text-muted">Classifications flagged LOW confidence, hallucination-guarded, or rules-only pending an LLM pass. Lowest confidence first.</p>
        <Select label="Status" value={status} onValueChange={(v) => { setStatus(v as 'pending' | 'reviewed'); setPage(1); }} options={[{ value: 'pending', label: 'Pending' }, { value: 'reviewed', label: 'Reviewed' }]} className="w-32" />
      </div>
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} className="m-4" /> : (
        <>
          <DataTable
            caption="Review queue"
            rows={q.data.items}
            rowKey={(r) => r.id}
            empty={<EmptyState icon={Check} title={status === 'pending' ? 'Review queue is clear' : 'Nothing reviewed yet'} />}
            columns={[
              { key: 'job', header: 'Posting', cell: (r) => <div className="max-w-xs"><Link to={`/jobs/${r.job.id}`} className="font-medium text-ink hover:underline">{r.job.title}</Link><p className="text-2xs text-muted">{r.job.company.name} · {r.job.primaryCity ?? 'no city'}</p></div> },
              { key: 'pred', header: 'Prediction', cell: (r) => <div className="text-xs"><p className="text-ink-2">{roleLabel(r.roleCategory)} · {expLabel(r.experienceLevel)}</p><p className="text-muted">{r.isFresherEligible ? 'Fresher-eligible' : 'Not fresher-eligible'} · {r.method.toLowerCase()}</p></div> },
              { key: 'conf', header: 'Confidence', align: 'right', cell: (r) => <span className="font-mono text-xs">{r.confidenceScore.toFixed(2)}</span> },
              { key: 'why', header: 'Flags', cell: (r) => <ul className="max-w-sm list-disc pl-4 text-2xs text-ink-2">{[...(r.confidenceFactors.notes ?? [])].slice(0, 3).map((n) => <li key={n} className="line-clamp-1">{n}</li>)}</ul> },
              {
                key: 'act', header: '', align: 'right', cell: (r) => status === 'pending' ? (
                  <div className="flex justify-end gap-1">
                    {r.job.llmPending && <Button size="sm" variant="ghost" onClick={() => reclassify.mutate(r.job.id)}>Run LLM</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Correct</Button>
                    <Button size="sm" onClick={() => review.mutate({ id: r.id, action: 'approve' })}>Approve</Button>
                  </div>
                ) : <Meta>{fmtRelative(r.reviewedAt)}</Meta>,
              },
            ]}
          />
          <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />
        </>
      )}
      <OverrideDialog key={editing?.id} item={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function DuplicatesTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('PENDING');
  const q = useDuplicates(page, status);
  const review = useReviewDuplicate();
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="text-xs text-muted">Pairs the detector would not merge on its own. Same-source near-identical listings are flagged here rather than merged.</p>
        <Select label="Status" value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: 'PENDING', label: 'Pending review' }, { value: 'AUTO', label: 'Auto-merged' }, { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'REJECTED', label: 'Rejected' }]} className="w-40" />
      </div>
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} className="m-4" /> : q.data.items.length === 0 ? <EmptyState icon={Check} title="No duplicate decisions in this state" /> : (
        <>
          <ul className="divide-y divide-line">
            {q.data.items.map((d) => (
              <li key={d.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_1fr_180px]">
                {[d.canonicalJob, d.candidateJob].map((j, i) => j ? (
                  <div key={j.id} className="min-w-0 rounded-md border border-line p-2.5">
                    <Meta>{i === 0 ? 'Canonical' : 'Candidate'}</Meta>
                    <Link to={`/jobs/${j.id}`} className="mt-0.5 block truncate text-[0.8125rem] font-medium text-ink hover:underline">{j.title}</Link>
                    <p className="text-2xs text-muted">{j.company.name} · {j.primaryCity ?? '—'} · {j.status.toLowerCase()}</p>
                    <a href={j.postingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-2xs text-accent-ink hover:underline">Original <ExternalLink className="h-2.5 w-2.5" /></a>
                  </div>
                ) : <div key={i} className="rounded-md border border-dashed border-line p-2.5 text-xs text-muted">Merged into canonical (raw ref {d.rawJob.externalId.slice(0, 12)})</div>)}
                <div className="flex flex-col justify-between gap-2">
                  <div className="text-2xs text-ink-2">
                    <p><Badge tone="outline">{d.layer.toLowerCase().replace('_', ' ')}</Badge> <span className="font-mono">score {d.similarityScore.toFixed(3)}</span></p>
                    <p className="mt-1 font-mono text-muted">title {String(d.factors.title)} · desc {String(d.factors.description)} · loc {String(d.factors.location)}{d.factors.sameSource ? ' · same source' : ''}</p>
                  </div>
                  {d.reviewStatus === 'PENDING' && (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => review.mutate({ id: d.id, decision: 'CONFIRMED' })}><GitMerge className="h-3 w-3" />Merge</Button>
                      <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: d.id, decision: 'REJECTED' })}><Split className="h-3 w-3" />Keep both</Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

export default function AiMonitoring() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'duplicates' ? 'duplicates' : 'review';
  const counts = { review: useReviewQueue(1, 'pending').data?.total, dups: useDuplicates(1, 'PENDING').data?.total };
  return (
    <div className="space-y-4">
      <PageHeader title="AI classification" description="Human-in-the-loop review of uncertain predictions and duplicate decisions. Every override is stored as a new version; nothing is overwritten." />
      <Tabs value={tab} onValueChange={(v) => setSp(v === 'duplicates' ? { tab: v } : {}, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="review">Low-confidence review {counts.review !== undefined && <Badge tone="neutral">{fmtNumber(counts.review)}</Badge>}</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicate review {counts.dups !== undefined && <Badge tone="neutral">{fmtNumber(counts.dups)}</Badge>}</TabsTrigger>
        </TabsList>
        <TabsContent value="review"><ReviewTab /></TabsContent>
        <TabsContent value="duplicates"><DuplicatesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
