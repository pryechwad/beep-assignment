import { zodResolver } from '@hookform/resolvers/zod';
import { EMPLOYMENT_LABELS, EMPLOYMENT_TYPES, EVALUATION_ERROR_CATEGORIES, EVALUATION_ERROR_LABELS, EXPERIENCE_LABELS, EXPERIENCE_LEVELS, ROLE_CATEGORIES, ROLE_LABELS } from '@beep/shared';
import { CheckCircle2, Circle, Download, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Checkbox, FieldError, Label, Select } from '@/components/ui/form';
import { Badge, Card, CardHeader, Input, Meta } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { useEvalMetrics, useEvaluation, useSaveLabel, type Accuracy, type EvalItem } from '@/hooks/admin';
import { api } from '@/lib/api';
import { cn, empLabel, expLabel, fmtNumber, roleLabel } from '@/lib/format';

const schema = z.object({
  trueRole: z.enum(ROLE_CATEGORIES, { message: 'Choose the correct role' }),
  trueCity: z.string().trim().max(80),
  cityNotStated: z.boolean(),
  trueExperience: z.enum(EXPERIENCE_LEVELS, { message: 'Choose the experience level' }),
  trueEmployment: z.enum([...EMPLOYMENT_TYPES, 'NOT_STATED'] as [string, ...string[]], { message: 'Choose the employment type' }),
  trueFresherEligible: z.enum(['yes', 'no'], { message: 'Choose eligibility' }),
  extraErrors: z.array(z.enum(EVALUATION_ERROR_CATEGORIES)),
  notes: z.string().max(1000),
}).refine((v) => v.cityNotStated || v.trueCity.length > 0, { path: ['trueCity'], message: 'Enter the city or mark it as not stated' });
type FormValues = z.infer<typeof schema>;

const EXTRA_ERRORS = ['MISSING_INFORMATION', 'HALLUCINATED_EXTRACTION'] as const;

function AccuracyCell({ label, a }: { label: string; a: Accuracy }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-ink tabular">{a.accuracy === null ? '—' : `${a.accuracy.toFixed(1)}%`}</p>
      <p className="font-mono text-2xs text-muted tabular">{a.correct}/{a.total} correct</p>
    </div>
  );
}

function Metrics() {
  const m = useEvalMetrics();
  if (m.isPending) return <LoadingRows rows={2} />;
  if (m.isError) return <ErrorState error={m.error} />;
  const d = m.data;
  return (
    <Card>
      <CardHeader
        title="Measured accuracy"
        description={`Accuracy = correct predictions ÷ evaluated predictions × 100. Sample: ${d.sampleSize} of ${d.targetSampleSize} records labelled by a human. Ground truth is never LLM-generated.`}
        action={<Button asChild size="sm"><a href={api.url('/admin/evaluation/export.csv')}><Download className="h-3.5 w-3.5" />Export CSV</a></Button>}
      />
      <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <AccuracyCell label="Role" a={d.fields.role} />
        <AccuracyCell label="City" a={d.fields.city} />
        <AccuracyCell label="Experience" a={d.fields.experience} />
        <AccuracyCell label="Employment" a={d.fields.employment} />
        <AccuracyCell label="Eligibility" a={d.fields.eligibility} />
        <AccuracyCell label="Exact match (all 5)" a={d.exactMatch} />
      </div>
      <div className="grid gap-4 border-t border-line px-4 py-3 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink">Calibration — exact-match accuracy by confidence level</p>
          <table className="w-full text-xs">
            <tbody>
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => (
                <tr key={lvl} className="border-b border-line last:border-0">
                  <td className="py-1 text-ink-2">{lvl.toLowerCase()}</td>
                  <td className="py-1 text-right tabular text-ink">{d.byConfidence[lvl].accuracy === null ? '—' : `${d.byConfidence[lvl].accuracy?.toFixed(1)}%`}</td>
                  <td className="py-1 text-right font-mono text-2xs text-muted">n={d.byConfidence[lvl].total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-2xs text-muted">Confidence is useful only if HIGH is measurably more accurate than LOW. Small n per level means wide uncertainty.</p>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink">Error categories</p>
          <ul className="space-y-1 text-xs">
            {EVALUATION_ERROR_CATEGORIES.map((c) => (
              <li key={c} className="flex justify-between"><span className="text-ink-2">{EVALUATION_ERROR_LABELS[c]}</span><span className="tabular text-ink">{d.errorCategories[c]}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function LabelForm({ item, onSaved }: { item: EvalItem; onSaved: () => void }) {
  const save = useSaveLabel();
  const existing = item.label;
  const defaults: FormValues = useMemo(() => existing ? {
    trueRole: existing.trueRole, trueCity: existing.trueCity ?? '', cityNotStated: existing.trueCity === null, trueExperience: existing.trueExperience,
    trueEmployment: existing.trueEmployment ?? 'NOT_STATED', trueFresherEligible: existing.trueFresherEligible ? 'yes' : 'no',
    extraErrors: existing.errorCategories.filter((c) => (EXTRA_ERRORS as readonly string[]).includes(c)), notes: existing.notes ?? '',
  } : ({ trueRole: undefined, trueCity: '', cityNotStated: false, trueExperience: undefined, trueEmployment: undefined, trueFresherEligible: undefined, extraErrors: [], notes: '' } as unknown as FormValues), [existing]);
  const { control, register, handleSubmit, reset, watch, formState } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  useEffect(() => reset(defaults), [defaults, reset]);
  const notStated = watch('cityNotStated');

  const submit = handleSubmit((v) =>
    save.mutate(
      { classificationId: item.prediction.id, trueRole: v.trueRole, trueCity: v.cityNotStated ? null : v.trueCity, trueExperience: v.trueExperience, trueEmployment: v.trueEmployment === 'NOT_STATED' ? null : (v.trueEmployment as (typeof EMPLOYMENT_TYPES)[number]), trueFresherEligible: v.trueFresherEligible === 'yes', extraErrors: v.extraErrors, notes: v.notes || undefined },
      { onSuccess: onSaved },
    ),
  );
  const sel = (name: 'trueRole' | 'trueExperience' | 'trueEmployment' | 'trueFresherEligible', label: string, options: { value: string; label: string }[]) => (
    <div>
      <Label>{label}</Label>
      <Controller control={control} name={name} render={({ field }) => <Select label={label} value={field.value as string | undefined} onValueChange={field.onChange} options={options} placeholder="Select…" className="w-full" />} />
      <FieldError>{formState.errors[name]?.message}</FieldError>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        {sel('trueRole', 'Correct role', ROLE_CATEGORIES.map((r) => ({ value: r, label: ROLE_LABELS[r] })))}
        {sel('trueExperience', 'Correct experience', EXPERIENCE_LEVELS.map((r) => ({ value: r, label: EXPERIENCE_LABELS[r] })))}
        {sel('trueEmployment', 'Correct employment type', [{ value: 'NOT_STATED', label: 'Not stated in posting' }, ...EMPLOYMENT_TYPES.map((r) => ({ value: r, label: EMPLOYMENT_LABELS[r] }))])}
        {sel('trueFresherEligible', 'Fresher-eligible?', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }])}
        <div className="sm:col-span-2">
          <Label htmlFor="trueCity">Correct primary city</Label>
          <div className="flex items-center gap-2">
            <Input id="trueCity" disabled={notStated} placeholder="e.g. Bengaluru" {...register('trueCity')} />
            <Controller control={control} name="cityNotStated" render={({ field }) => <div className="shrink-0"><Checkbox id="cityNotStated" checked={field.value} onCheckedChange={field.onChange} label="Not stated" /></div>} />
          </div>
          <FieldError>{formState.errors.trueCity?.message}</FieldError>
        </div>
      </div>
      <div>
        <Label>Additional errors observed</Label>
        <Controller control={control} name="extraErrors" render={({ field }) => (
          <div className="flex flex-wrap gap-x-3">
            {EXTRA_ERRORS.map((c) => (
              <Checkbox key={c} id={`err-${c}`} checked={field.value.includes(c)} onCheckedChange={(on) => field.onChange(on ? [...field.value, c] : field.value.filter((x) => x !== c))} label={EVALUATION_ERROR_LABELS[c]} />
            ))}
          </div>
        )} />
        <p className="mt-0.5 text-2xs text-muted">Wrong role / city / experience / eligibility are derived automatically by comparing your labels with the prediction.</p>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" placeholder="Optional" {...register('notes')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={save.isPending}>{existing ? 'Update label' : 'Save label'}</Button>
      </div>
    </form>
  );
}

export default function Evaluation() {
  const ev = useEvaluation();
  const [selected, setSelected] = useState<string | null>(null);
  const items = ev.data?.items ?? [];
  const current = items.find((i) => i.prediction.id === selected) ?? items.find((i) => !i.label) ?? items[0];
  const nextUnlabelled = () => {
    const idx = items.findIndex((i) => i.prediction.id === current?.prediction.id);
    const next = [...items.slice(idx + 1), ...items.slice(0, idx)].find((i) => !i.label && i.prediction.id !== current?.prediction.id);
    setSelected(next?.prediction.id ?? null);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Human evaluation" description="A fixed, stratified sample of 50 predictions (spread across roles and confidence levels). Read the original posting, then record what is actually true — do not copy the model’s answer." />
      <Metrics />
      {ev.isPending ? <LoadingRows /> : ev.isError ? <ErrorState error={ev.error} /> : items.length === 0 ? (
        <Card><EmptyState title="No predictions to evaluate yet">The sample is drawn from current non-manual classifications of active jobs.</EmptyState></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="max-h-[calc(100vh-8rem)] overflow-y-auto lg:sticky lg:top-4">
            <div className="border-b border-line px-3 py-2 text-xs text-muted tabular">{ev.data.audited} of {items.length} labelled</div>
            <ul>
              {items.map((i, n) => (
                <li key={i.prediction.id}>
                  <button type="button" onClick={() => setSelected(i.prediction.id)} className={cn('flex w-full items-start gap-2 border-b border-line px-3 py-2 text-left hover:bg-canvas', current?.prediction.id === i.prediction.id && 'bg-accent-soft/50')}>
                    {i.label ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-label="Labelled" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" aria-label="Not labelled" />}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-ink">{n + 1}. {i.job.title}</span>
                      <span className="block truncate text-2xs text-muted">{i.job.company.name} · {i.prediction.confidenceLevel.toLowerCase()}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {current && (
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader title="Original posting" description={`${current.job.company.name} — ${current.job.title}`} action={<a href={current.job.postingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-ink hover:underline">Open source <ExternalLink className="h-3 w-3" /></a>} />
                {current.job.sourceFacts && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-2xs text-ink-2">
                    <span><Meta>Locations</Meta> {current.job.sourceFacts.locations.join(' · ') || '—'}</span>
                    <span><Meta>Type</Meta> {current.job.sourceFacts.employmentType ?? '—'}</span>
                    <span><Meta>Workplace</Meta> {current.job.sourceFacts.workplaceType ?? '—'}</span>
                  </div>
                )}
                <div className="prose-source max-h-[70vh] overflow-y-auto whitespace-pre-line px-4 py-3 text-[0.8125rem]">{current.job.description}</div>
              </Card>
              <div className="space-y-4">
                <Card>
                  <CardHeader title="Model prediction" description={`${current.prediction.method.toLowerCase()} · ${current.prediction.model ?? 'rules'} · confidence ${current.prediction.confidenceScore.toFixed(2)}`} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-xs">
                    {[
                      ['Role', roleLabel(current.prediction.roleCategory)],
                      ['City', current.prediction.city ?? 'Not stated'],
                      ['Experience', expLabel(current.prediction.experienceLevel)],
                      ['Employment', empLabel(current.prediction.employmentType)],
                      ['Fresher-eligible', current.prediction.isFresherEligible ? 'Yes' : 'No'],
                    ].map(([k, v]) => (<div key={k}><dt className="text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>))}
                  </dl>
                  {current.label && (
                    <div className="flex flex-wrap gap-1 border-t border-line px-4 py-2">
                      {(['roleCorrect', 'cityCorrect', 'experienceCorrect', 'employmentCorrect', 'eligibilityCorrect'] as const).map((k) => (
                        <Badge key={k} tone={current.label![k] ? 'success' : 'danger'}>{k.replace('Correct', '')} {current.label![k] ? '✓' : '✗'}</Badge>
                      ))}
                    </div>
                  )}
                </Card>
                <Card className="p-4">
                  <LabelForm key={current.prediction.id} item={current} onSaved={nextUnlabelled} />
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
      {items.length > 0 && <p className="text-2xs text-muted">{fmtNumber(items.filter((i) => i.label).length)} labelled. The sample stays fixed once labelling starts; new picks only fill unlabelled slots.</p>}
    </div>
  );
}
