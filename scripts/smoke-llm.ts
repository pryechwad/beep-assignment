/** Dev smoke check: classify one live posting with the configured AI providers (no DB writes). */
import { loadAIConfig, StructuredRunner, jobIntelligencePrompt as P } from '@beep/ai-engine';
import { collectFromSource } from '@beep/scraper-engine';

const cfg = loadAIConfig();
console.log('providers:', cfg.providers.map((p) => `${p.name}:${p.chatModel}`), 'missing:', cfg.missingKeys);
const board = process.argv[2] ?? 'fampay';
const r = await collectFromSource({ adapterType: 'LEVER', boardToken: board, companyName: board, sourceId: `lever:${board}`, sourceName: board, rateLimitPerMinute: 30, indiaOnly: true });
const job = r.jobs.find((j) => /intern/i.test(j.title)) ?? r.jobs[0]!;
const req = P.buildRequest({ title: job.title, company: job.companyName, locations: job.locations, department: job.department, sourceEmploymentType: job.employmentType, sourceWorkplaceType: job.workplaceType, description: job.descriptionText });
const out = await new StructuredRunner(cfg.providers).run({ promptVersion: P.PROMPT_VERSION, request: req, schema: P.outputSchema });
console.log(job.title, '|', job.locations.join('|'));
console.log(JSON.stringify(out.value, null, 1));
for (const u of out.usage) console.log(`usage ${u.provider}/${u.model} in=${u.inputTokens} out=${u.outputTokens} measured=${u.tokensMeasured} $${u.costUsd.toFixed(6)} ok=${u.success} ${u.errorMessage ?? ''}`);
