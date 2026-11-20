import { ROLE_CATEGORIES } from '@beep/shared';

export const version = 'role.v1';

export const instructions = `ROLE CATEGORY — choose exactly one of: ${ROLE_CATEGORIES.join(', ')}.
- Decide from the job's primary day-to-day work, not from the company's industry.
- FRONTEND: web/mobile UI engineering. BACKEND: server-side services/APIs. FULL_STACK: explicitly both.
- SOFTWARE_ENGINEERING: general software roles that do not clearly fit frontend/backend/full stack (incl. embedded, QA/SDET, mobile platform).
- AI_ML: building/training/deploying ML or LLM systems. DATA_SCIENCE: statistical modelling/experimentation. DATA_ENGINEERING: pipelines/warehouses.
- ANALYTICS: business/product/data analysis and reporting. DEVOPS: CI/CD, SRE, infra automation. CLOUD: cloud architecture/administration.
- CYBERSECURITY: security engineering/operations. PRODUCT: product management. DESIGN: UX/UI/visual design.
- MARKETING, SALES (incl. account executives, business development, pre-sales), FINANCE (incl. accounting, audit, controllership), OPERATIONS (incl. support, HR, legal, program management, admin).
- OTHER only when none of the above apply.
- role_evidence: copy a short verbatim phrase from the title or description that justifies the category.`;
