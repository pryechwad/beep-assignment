import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, ROLE_CATEGORIES, SOURCE_ADAPTER_TYPES, WORK_MODES } from '@beep/shared';

/** OpenAPI 3.1 description of the v1 REST API (served at GET /api/v1/openapi.json). */
const arr = (values: readonly string[]) => ({ type: 'array', items: { type: 'string', enum: values } });
const qp = (name: string, schema: object, description: string) => ({ name, in: 'query', required: false, schema, description, style: 'form', explode: false });
const pathId = (name = 'id') => ({ name, in: 'path', required: true, schema: { type: 'string' } });
const pageParams = [qp('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number'), qp('pageSize', { type: 'integer', minimum: 1, maximum: 100 }, 'Page size')];
const ok = (description: string) => ({ 200: { description, content: { 'application/json': {} } }, 400: { $ref: '#/components/responses/Error' } });
const admin = { security: [{ cookieAuth: [] }, { bearerAuth: [] }] };
const adminResponses = (description: string) => ({ ...ok(description), 401: { $ref: '#/components/responses/Error' }, 403: { $ref: '#/components/responses/Error' } });

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'BEEP Job Intelligence API',
    version: '1.0.0',
    description: 'Public opportunity search and analytics, plus authenticated pipeline administration. All data comes from live public ATS sources; nullable fields mean the source did not state the value.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'beep_session' },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: {
      Error: {
        description: 'Error envelope',
        content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {}, requestId: { type: 'string' } }, required: ['code', 'message'] } } } } },
      },
    },
  },
  paths: {
    '/jobs': {
      get: {
        summary: 'Search opportunities (server-side full-text search, filters, pagination)',
        parameters: [
          qp('q', { type: 'string' }, 'Full-text query across title, department, description and company'),
          qp('company', { type: 'string' }, 'Company name contains'),
          qp('skill', { type: 'array', items: { type: 'string' } }, 'Required skills (all must match)'),
          qp('location', { type: 'string' }, 'City/state/raw location contains; "remote" matches remote roles'),
          qp('role', arr(ROLE_CATEGORIES), 'Role categories'),
          qp('city', { type: 'array', items: { type: 'string' } }, 'Normalised cities'),
          qp('state', { type: 'array', items: { type: 'string' } }, 'States'),
          qp('employmentType', arr(EMPLOYMENT_TYPES), 'Employment types'),
          qp('experience', arr(EXPERIENCE_LEVELS), 'Experience levels'),
          qp('workMode', arr(WORK_MODES), 'Work modes'),
          qp('source', arr(SOURCE_ADAPTER_TYPES), 'Source platforms'),
          qp('fresher', { type: 'boolean' }, 'Fresher eligibility'),
          qp('internship', { type: 'boolean' }, 'Internships only'),
          qp('postedWithinDays', { type: 'integer' }, 'Published (or first seen, if unpublished) within N days'),
          qp('status', { type: 'string', enum: ['ACTIVE', 'CLOSED', 'ALL'] }, 'Listing status (default ACTIVE)'),
          qp('sort', { type: 'string', enum: ['newest', 'relevance', 'company', 'title'] }, 'Sort order'),
          ...pageParams,
        ],
        responses: ok('Paginated job list'),
      },
    },
    '/jobs/filters': { get: { summary: 'Facet values with counts for active jobs', responses: ok('Filter facets') } },
    '/jobs/{id}': { get: { summary: 'Job detail: source facts, AI classification, sources and verification', parameters: [pathId()], responses: { ...ok('Job detail'), 404: { $ref: '#/components/responses/Error' } } } },
    '/companies': { get: { summary: 'Companies with active openings', parameters: [qp('q', { type: 'string' }, 'Name contains')], responses: ok('Company list') } },
    '/analytics/overview': { get: { summary: 'Headline KPIs, data freshness and pipeline status', responses: ok('Overview') } },
    '/analytics/roles': { get: { summary: 'Active jobs by role category', responses: ok('Counts') } },
    '/analytics/cities': { get: { summary: 'Active jobs by city', parameters: [qp('limit', { type: 'integer' }, 'Max cities')], responses: ok('Counts') } },
    '/analytics/employment': { get: { summary: 'Active jobs by employment type', responses: ok('Counts') } },
    '/analytics/experience': { get: { summary: 'Active jobs by experience level', responses: ok('Counts') } },
    '/analytics/daily': { get: { summary: 'Jobs added/closed per IST day', parameters: [qp('days', { type: 'integer' }, 'Window (7–180)')], responses: ok('Series') } },
    '/analytics/sources': { get: { summary: 'Active jobs by source platform', responses: ok('Counts') } },
    '/live/activity': { get: { summary: 'Live pipeline activity: run status, queue depth, AI tagging progress and the latest AI-tagged postings (no-store; polled by the UI)', responses: ok('Activity') } },
    '/sources/status': { get: { summary: 'Health of every configured source', responses: ok('Sources') } },
    '/auth/login': { post: { summary: 'Sign in; sets an httpOnly session cookie', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } }, responses: { ...ok('Signed in'), 401: { $ref: '#/components/responses/Error' }, 429: { $ref: '#/components/responses/Error' } } } },
    '/auth/logout': { post: { summary: 'Clear the session', responses: ok('Signed out') } },
    '/auth/me': { get: { ...admin, summary: 'Current admin user', responses: adminResponses('User') } },
    '/admin/overview': { get: { ...admin, summary: 'Operational dashboard: queues, workers, sources, throughput, AI success/cost, errors', responses: adminResponses('Overview') } },
    '/admin/sync/trigger': { post: { ...admin, summary: 'Start a collection run (optionally for specific sources)', responses: { ...adminResponses('Queued'), 409: { $ref: '#/components/responses/Error' } } } },
    '/admin/scrape-runs': { get: { ...admin, summary: 'Collection run history', parameters: pageParams, responses: adminResponses('Runs') } },
    '/admin/scrape-runs/{id}': { get: { ...admin, summary: 'One run with per-source tasks', parameters: [pathId()], responses: adminResponses('Run') } },
    '/admin/queue': { get: { ...admin, summary: 'Queue depths, dead-letter entries, worker heartbeats', responses: adminResponses('Queues') } },
    '/admin/queue/dead-letter/{id}/retry': { post: { ...admin, summary: 'Re-enqueue a dead-lettered job', parameters: [pathId()], responses: adminResponses('Requeued') } },
    '/admin/queue/{queue}/retry-failed': { post: { ...admin, summary: 'Retry failed jobs of a queue', parameters: [pathId('queue')], responses: adminResponses('Retried') } },
    '/admin/sources/{id}': { patch: { ...admin, summary: 'Enable/disable a source or change its rate limit', parameters: [pathId()], responses: adminResponses('Updated source') } },
    '/admin/sources/{id}/sync': { post: { ...admin, summary: 'Collect one source now', parameters: [pathId()], responses: adminResponses('Queued') } },
    '/admin/classifications/review': { get: { ...admin, summary: 'Low-confidence classifications awaiting review', parameters: pageParams, responses: adminResponses('Review queue') } },
    '/admin/classifications/{id}/review': { post: { ...admin, summary: 'Approve or override a classification (override creates a MANUAL version)', parameters: [pathId()], responses: adminResponses('Reviewed') } },
    '/admin/jobs/{id}/reclassify': { post: { ...admin, summary: 'Force an LLM re-classification', parameters: [pathId()], responses: adminResponses('Queued') } },
    '/admin/duplicates': { get: { ...admin, summary: 'Duplicate decisions by review status', parameters: pageParams, responses: adminResponses('Duplicates') } },
    '/admin/duplicates/{id}/review': { post: { ...admin, summary: 'Confirm (merge) or reject a possible duplicate', parameters: [pathId()], responses: adminResponses('Reviewed') } },
    '/admin/evaluation': { get: { ...admin, summary: 'The 50-record stratified evaluation sample with predictions and labels', responses: adminResponses('Sample') } },
    '/admin/evaluation/{classificationId}': { put: { ...admin, summary: 'Save human ground-truth labels for a prediction', parameters: [pathId('classificationId')], responses: adminResponses('Saved') } },
    '/admin/evaluation/metrics': { get: { ...admin, summary: 'Accuracy per field, exact match, calibration by confidence, error categories', responses: adminResponses('Metrics') } },
    '/admin/evaluation/export.csv': { get: { ...admin, summary: 'Evaluation export (CSV)', responses: { 200: { description: 'CSV', content: { 'text/csv': {} } } } } },
    '/admin/ai-usage': { get: { ...admin, summary: 'Token usage, measured-token cost and cost per 1,000 posts', parameters: [qp('days', { type: 'integer' }, 'Window')], responses: adminResponses('Usage') } },
    '/admin/ai-usage/export.csv': { get: { ...admin, summary: 'Per-call AI usage export (CSV)', responses: { 200: { description: 'CSV', content: { 'text/csv': {} } } } } },
    '/admin/errors': { get: { ...admin, summary: 'Persisted pipeline warnings and errors', parameters: pageParams, responses: adminResponses('Logs') } },
    '/admin/trace/{correlationId}': { get: { ...admin, summary: 'Trace one record through discovery → normalisation → classification', parameters: [pathId('correlationId')], responses: adminResponses('Trace') } },
  },
} as const;
