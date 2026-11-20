/**
 * Skills dictionary. Matching is deterministic and whole-word; ambiguous
 * short names (Go, R, C) use case-sensitive patterns that require a
 * programming-language context so prose like "go to market" never matches.
 */
interface SkillDef {
  name: string;
  patterns: RegExp[];
}

const w = (alias: string, flags = 'i') =>
  new RegExp(`(?<![A-Za-z0-9+#.])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9+#])`, flags);
const def = (name: string, ...aliases: string[]): SkillDef => ({ name, patterns: [name, ...aliases].map((a) => w(a)) });

export const SKILLS: SkillDef[] = [
  def('JavaScript', 'javascript', 'js', 'es6'),
  def('TypeScript', 'typescript'),
  def('Python'),
  def('Java'),
  { name: 'Go', patterns: [w('golang'), /(?<![A-Za-z])Go(?=\s*(?:,|\/|\)|lang\b|\s+(?:and|or)\s+[A-Z]))/] },
  def('Rust'),
  def('C++', 'cpp'),
  def('C#', 'csharp'),
  def('.NET', 'dotnet', 'asp.net'),
  def('Kotlin'),
  def('Swift'),
  def('Scala'),
  def('Ruby'),
  def('Ruby on Rails', 'rails'),
  def('PHP'),
  { name: 'R', patterns: [/(?<![A-Za-z])R(?=\s*(?:,|\/|\)|\s+(?:and|or)\s+(?:Python|SQL|SAS)))/, /\bR programming\b/i, /(?:Python|SQL|SAS)\s*(?:,|\/|and|or)\s*R(?![A-Za-z])/] },
  def('SQL'),
  def('PostgreSQL', 'postgres'),
  def('MySQL'),
  def('MongoDB', 'mongo'),
  def('Redis'),
  def('Elasticsearch', 'elastic search', 'opensearch'),
  def('Kafka', 'apache kafka'),
  def('Spark', 'apache spark', 'pyspark'),
  def('Hadoop'),
  def('Airflow', 'apache airflow'),
  def('dbt'),
  def('Snowflake'),
  def('BigQuery'),
  def('Databricks'),
  def('React', 'react.js', 'reactjs'),
  def('React Native'),
  def('Next.js', 'nextjs'),
  def('Vue', 'vue.js', 'vuejs'),
  def('Angular', 'angularjs'),
  def('Node.js', 'nodejs', 'node js'),
  { name: 'Express', patterns: [w('express.js'), w('expressjs'), w('Express', '')] },
  def('Django'),
  def('Flask'),
  def('FastAPI'),
  def('Spring Boot', 'springboot', 'spring framework'),
  def('GraphQL'),
  def('REST APIs', 'rest api', 'restful', 'rest apis'),
  def('Microservices', 'microservice'),
  def('HTML', 'html5'),
  def('CSS', 'css3'),
  def('Tailwind CSS', 'tailwind'),
  def('Redux'),
  def('Android'),
  def('iOS'),
  def('Flutter'),
  def('AWS', 'amazon web services'),
  def('GCP', 'google cloud', 'google cloud platform'),
  def('Azure', 'microsoft azure'),
  def('Docker'),
  def('Kubernetes', 'k8s'),
  def('Terraform'),
  def('Ansible'),
  def('Linux', 'unix'),
  def('Git', 'github', 'gitlab'),
  def('CI/CD', 'ci / cd', 'continuous integration'),
  def('Jenkins'),
  def('Prometheus'),
  def('Grafana'),
  def('Machine Learning', 'ml'),
  def('Deep Learning'),
  def('NLP', 'natural language processing'),
  def('Computer Vision'),
  def('LLMs', 'llm', 'large language models', 'generative ai', 'genai'),
  def('PyTorch'),
  def('TensorFlow'),
  def('scikit-learn', 'sklearn'),
  def('Pandas'),
  def('NumPy'),
  def('Statistics', 'statistical'),
  { name: 'Excel', patterns: [w('ms excel'), w('microsoft excel'), w('advanced excel'), w('Excel', '')] },
  def('Power BI', 'powerbi'),
  def('Tableau'),
  def('Looker'),
  def('Data Structures', 'data structure', 'dsa'),
  def('Algorithms'),
  def('System Design'),
  def('Selenium'),
  def('Cypress'),
  def('Playwright'),
  def('Figma'),
  def('SEO'),
  def('Google Analytics'),
  def('Salesforce'),
  def('SAP'),
  def('Jira'),
  def('Computer Networking', 'tcp/ip', 'network protocols'),
  def('SIEM'),
  def('Penetration Testing', 'pentesting', 'pen testing'),
];

export interface SkillMatch {
  name: string;
  /** Occurrences in title count heavily, then description frequency. */
  score: number;
}

/** Return dictionary skills mentioned in the posting, most relevant first. */
export function extractSkills(title: string, description: string, limit = 12): SkillMatch[] {
  const matches: SkillMatch[] = [];
  for (const skill of SKILLS) {
    let score = 0;
    for (const re of skill.patterns) {
      if (re.test(title)) score += 10;
      const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      score += Math.min((description.match(global) ?? []).length, 5);
    }
    if (score > 0) matches.push({ name: skill.name, score });
  }
  // "React Native" also matches "React"; keep both only if React appears on its own.
  return matches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Map a free-text skill (e.g. from an LLM) to the dictionary's canonical name, if known. */
export function canonicalSkillName(raw: string): string | null {
  const cleaned = raw.trim();
  for (const skill of SKILLS) {
    if (skill.patterns.some((re) => new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')).test(cleaned))) return skill.name;
  }
  return null;
}

export function skillKey(name: string): string {
  return name.toLowerCase().replace(/\+/g, 'plus').replace(/#/g, 'sharp').replace(/[^a-z0-9]+/g, '');
}
