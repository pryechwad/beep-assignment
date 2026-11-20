import type { HttpClient } from './http';

/**
 * Minimal robots.txt evaluation for our user agent (group "*" or our bot
 * name). Longest matching rule wins; Allow beats Disallow on ties. A missing
 * robots.txt (4xx) means everything is allowed; a 5xx/unreachable robots.txt
 * is treated conservatively as "disallow" per RFC 9309 §2.3.1.4.
 */
interface Rule {
  allow: boolean;
  path: string;
}

export function parseRobots(body: string, agent = 'beepjobintelligencebot'): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (key === 'allow' || key === 'disallow') {
        if (key === 'disallow' && value === '') continue;
        current.rules.push({ allow: key === 'allow', path: value });
      }
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

function ruleMatches(path: string, rulePath: string): boolean {
  const anchored = rulePath.endsWith('$');
  const pattern = rulePath.replace(/\$$/, '').replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path);
}

export function isPathAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!ruleMatches(path, r.path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

export class RobotsCache {
  private cache = new Map<string, { rules: Rule[] | 'deny-all'; fetchedAt: number }>();
  constructor(
    private readonly http: HttpClient,
    private readonly ttlMs = 6 * 3600 * 1000,
  ) {}

  async isAllowed(url: string): Promise<boolean> {
    const u = new URL(url);
    const origin = u.origin;
    let entry = this.cache.get(origin);
    if (!entry || Date.now() - entry.fetchedAt > this.ttlMs) {
      let rules: Rule[] | 'deny-all';
      try {
        const res = await this.http.getText(`${origin}/robots.txt`);
        if (res.status >= 200 && res.status < 300) rules = parseRobots(res.body);
        else if (res.status >= 400 && res.status < 500) rules = [];
        else rules = 'deny-all';
      } catch {
        rules = 'deny-all';
      }
      entry = { rules, fetchedAt: Date.now() };
      this.cache.set(origin, entry);
    }
    if (entry.rules === 'deny-all') return false;
    return isPathAllowed(entry.rules, u.pathname + u.search);
  }
}
