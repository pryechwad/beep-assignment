import { jobIntelligencePrompt, StructuredCallError, type StructuredRunner, type UsageRecord } from '@beep/ai-engine';
import { classifyByRules, rulesSufficient, type RuleResult } from './rules';
import { finalizeFromRules, mergeWithLLM, type FinalClassification, type NormalizedFacts } from './merge';

export * from './rules';
export * from './merge';
export * from './evidence';

export interface ClassifyOptions {
  runner: StructuredRunner | null;
  company: string;
  sourceEmploymentType: string | null;
  sourceWorkplaceType: string | null;
  /** Force the LLM even when rules are sufficient (e.g. manual re-classification). */
  forceLLM?: boolean;
  /** Budget guard: when false, the LLM is not called and rules are used. */
  llmAllowed?: boolean;
  /** Send every posting to the LLM (assignment: "LLM tags each post"), not only uncertain/early-career ones. */
  llmForAll?: boolean;
}

export interface ClassifyOutcome {
  result: FinalClassification;
  rules: RuleResult;
  llm: { provider: string; model: string; promptVersion: string } | null;
  usage: UsageRecord[];
  processingMs: number;
  /** Why the LLM was or was not used. */
  route: 'rules-sufficient' | 'llm' | 'llm-failed-fallback' | 'llm-unavailable' | 'llm-budget-exhausted';
  llmError: string | null;
}

/**
 * Full classification workflow for one job:
 * deterministic preprocessing → rule classification → (LLM if needed) →
 * structured validation → evidence checks → confidence → review flag.
 */
export async function classifyJob(facts: NormalizedFacts, opts: ClassifyOptions): Promise<ClassifyOutcome> {
  const started = Date.now();
  const rules = classifyByRules({ title: facts.title, description: facts.description, department: facts.department, employmentType: facts.employmentType });

  if (!opts.forceLLM && !opts.llmForAll && rulesSufficient(rules)) {
    return { result: finalizeFromRules(rules, facts), rules, llm: null, usage: [], processingMs: Date.now() - started, route: 'rules-sufficient', llmError: null };
  }
  if (!opts.runner || opts.runner.availableProviders.length === 0) {
    const result = finalizeFromRules(rules, facts, ['LLM unavailable']);
    return { result: { ...result, needsReview: true }, rules, llm: null, usage: [], processingMs: Date.now() - started, route: 'llm-unavailable', llmError: null };
  }
  if (opts.llmAllowed === false) {
    const result = finalizeFromRules(rules, facts, ['LLM budget for this run exhausted']);
    return { result: { ...result, needsReview: true }, rules, llm: null, usage: [], processingMs: Date.now() - started, route: 'llm-budget-exhausted', llmError: null };
  }

  const request = jobIntelligencePrompt.buildRequest({
    title: facts.title,
    company: opts.company,
    locations: facts.locationsRaw,
    department: facts.department,
    sourceEmploymentType: opts.sourceEmploymentType,
    sourceWorkplaceType: opts.sourceWorkplaceType,
    description: facts.description,
  });
  try {
    const out = await opts.runner.run({ promptVersion: jobIntelligencePrompt.PROMPT_VERSION, request, schema: jobIntelligencePrompt.outputSchema });
    const result = mergeWithLLM(rules, facts, out.value, out.repaired);
    return {
      result,
      rules,
      llm: { provider: out.provider, model: out.model, promptVersion: jobIntelligencePrompt.PROMPT_VERSION },
      usage: out.usage,
      processingMs: Date.now() - started,
      route: 'llm',
      llmError: null,
    };
  } catch (e) {
    const usage = e instanceof StructuredCallError ? e.usage : [];
    const msg = (e as Error).message;
    const result = finalizeFromRules(rules, facts, [`LLM failed: ${msg.slice(0, 160)}`]);
    return { result: { ...result, needsReview: true, validationStatus: 'INVALID', validationErrors: [msg.slice(0, 300)] }, rules, llm: null, usage, processingMs: Date.now() - started, route: 'llm-failed-fallback', llmError: msg };
  }
}
