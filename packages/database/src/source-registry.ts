import type { SourceAdapterType } from '@beep/shared';

export interface SourceSeed {
  adapterType: SourceAdapterType;
  boardToken: string;
  /** Employer display name (board tokens are not always human-readable). */
  companyName: string;
  website: string | null;
}

/**
 * Public ATS job boards verified on 2026-11-20 to respond on their official
 * public posting APIs and to list India-located roles. Only configuration lives
 * here — every job is fetched live from the source.
 *
 *   Greenhouse: https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *   Lever:      https://api.lever.co/v0/postings/{token}?mode=json
 *   Ashby:      https://api.ashbyhq.com/posting-api/job-board/{token}
 */
export const SOURCE_REGISTRY: SourceSeed[] = [
  // Greenhouse
  { adapterType: 'GREENHOUSE', boardToken: 'razorpaysoftwareprivatelimited', companyName: 'Razorpay', website: 'https://razorpay.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'groww', companyName: 'Groww', website: 'https://groww.in' },
  { adapterType: 'GREENHOUSE', boardToken: 'druva', companyName: 'Druva', website: 'https://www.druva.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'rubrik', companyName: 'Rubrik', website: 'https://www.rubrik.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'hackerrank', companyName: 'HackerRank', website: 'https://www.hackerrank.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'gitlab', companyName: 'GitLab', website: 'https://about.gitlab.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'databricks', companyName: 'Databricks', website: 'https://www.databricks.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'mongodb', companyName: 'MongoDB', website: 'https://www.mongodb.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'stripe', companyName: 'Stripe', website: 'https://stripe.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'airbnb', companyName: 'Airbnb', website: 'https://www.airbnb.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'coinbase', companyName: 'Coinbase', website: 'https://www.coinbase.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'twilio', companyName: 'Twilio', website: 'https://www.twilio.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'okta', companyName: 'Okta', website: 'https://www.okta.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'elastic', companyName: 'Elastic', website: 'https://www.elastic.co' },
  { adapterType: 'GREENHOUSE', boardToken: 'commvault', companyName: 'Commvault', website: 'https://www.commvault.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'toast', companyName: 'Toast', website: 'https://pos.toasttab.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'mozilla', companyName: 'Mozilla', website: 'https://www.mozilla.org' },
  { adapterType: 'GREENHOUSE', boardToken: 'samsara', companyName: 'Samsara', website: 'https://www.samsara.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'sumologic', companyName: 'Sumo Logic', website: 'https://www.sumologic.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'turing', companyName: 'Turing', website: 'https://www.turing.com' },
  { adapterType: 'GREENHOUSE', boardToken: 'observeai', companyName: 'Observe.AI', website: 'https://www.observe.ai' },
  { adapterType: 'GREENHOUSE', boardToken: 'zscaler', companyName: 'Zscaler', website: 'https://www.zscaler.com' },
  // Lever
  { adapterType: 'LEVER', boardToken: 'paytm', companyName: 'Paytm', website: 'https://paytm.com' },
  { adapterType: 'LEVER', boardToken: 'cred', companyName: 'CRED', website: 'https://cred.club' },
  { adapterType: 'LEVER', boardToken: 'zeta', companyName: 'Zeta', website: 'https://www.zeta.tech' },
  { adapterType: 'LEVER', boardToken: 'mindtickle', companyName: 'Mindtickle', website: 'https://www.mindtickle.com' },
  { adapterType: 'LEVER', boardToken: 'fampay', companyName: 'FamPay', website: 'https://famapp.in' },
  { adapterType: 'LEVER', boardToken: 'pocketfm', companyName: 'Pocket FM', website: 'https://pocketfm.com' },
  // Ashby
  { adapterType: 'ASHBY', boardToken: 'sarvam', companyName: 'Sarvam AI', website: 'https://www.sarvam.ai' },
  { adapterType: 'ASHBY', boardToken: 'atlan', companyName: 'Atlan', website: 'https://atlan.com' },
  { adapterType: 'ASHBY', boardToken: 'plane', companyName: 'Plane', website: 'https://plane.so' },
  { adapterType: 'ASHBY', boardToken: 'composio', companyName: 'Composio', website: 'https://composio.dev' },
  { adapterType: 'ASHBY', boardToken: 'smallest', companyName: 'Smallest AI', website: 'https://smallest.ai' },
  { adapterType: 'ASHBY', boardToken: 'clickhouse', companyName: 'ClickHouse', website: 'https://clickhouse.com' },
  { adapterType: 'ASHBY', boardToken: 'openai', companyName: 'OpenAI', website: 'https://openai.com' },
  { adapterType: 'ASHBY', boardToken: 'perplexity', companyName: 'Perplexity', website: 'https://www.perplexity.ai' },
  { adapterType: 'ASHBY', boardToken: 'harvey', companyName: 'Harvey', website: 'https://www.harvey.ai' },
  { adapterType: 'ASHBY', boardToken: 'anyscale', companyName: 'Anyscale', website: 'https://www.anyscale.com' },
  { adapterType: 'ASHBY', boardToken: 'temporal', companyName: 'Temporal', website: 'https://temporal.io' },
  { adapterType: 'ASHBY', boardToken: 'notion', companyName: 'Notion', website: 'https://www.notion.so' },
];

export function sourceIdFor(adapterType: SourceAdapterType, boardToken: string): string {
  return `${adapterType.toLowerCase()}:${boardToken}`;
}
