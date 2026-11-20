import type { EmploymentType, RoleCategory, WorkMode } from '@beep/shared';

/**
 * Colour system. Seven hues, each with a solid (marks, icons), soft (tinted
 * backgrounds) and ink (text on soft) step. Colour always travels with a text
 * label — it adds recognition, never carries meaning alone.
 */
export const HUES = {
  blue: { solid: '#315CF5', soft: '#EEF2FE', ink: '#2346C9', ring: '#C9D6FD' },
  violet: { solid: '#7C5CE6', soft: '#F3EFFE', ink: '#5B3FC4', ring: '#DDD3FB' },
  teal: { solid: '#0E9F84', soft: '#E7F7F3', ink: '#0B7562', ring: '#B6E6DB' },
  rose: { solid: '#E0457B', soft: '#FDEEF3', ink: '#B4295A', ring: '#F7C6D7' },
  orange: { solid: '#EB6834', soft: '#FEF1EB', ink: '#B9471A', ring: '#F9CDB9' },
  amber: { solid: '#D99100', soft: '#FDF5E2', ink: '#8F5F00', ring: '#F3DDA6' },
  green: { solid: '#16845B', soft: '#E9F5EF', ink: '#116847', ring: '#BFE3D1' },
  slate: { solid: '#717784', soft: '#F1F2F5', ink: '#3D414B', ring: '#DADDE3' },
} as const;
export type Hue = keyof typeof HUES;

/** Roles are coloured by field (≤7 hues), so related roles share a colour. */
export const ROLE_FAMILIES: { key: string; label: string; hue: Hue; roles: RoleCategory[] }[] = [
  { key: 'eng', label: 'Engineering', hue: 'blue', roles: ['SOFTWARE_ENGINEERING', 'FRONTEND', 'BACKEND', 'FULL_STACK'] },
  { key: 'data', label: 'Data & AI', hue: 'violet', roles: ['AI_ML', 'DATA_SCIENCE', 'DATA_ENGINEERING', 'ANALYTICS'] },
  { key: 'infra', label: 'Cloud & Security', hue: 'teal', roles: ['DEVOPS', 'CLOUD', 'CYBERSECURITY'] },
  { key: 'product', label: 'Product & Design', hue: 'rose', roles: ['PRODUCT', 'DESIGN'] },
  { key: 'gtm', label: 'Sales & Marketing', hue: 'orange', roles: ['SALES', 'MARKETING'] },
  { key: 'biz', label: 'Finance & Operations', hue: 'amber', roles: ['FINANCE', 'OPERATIONS'] },
];

export function roleHue(role: RoleCategory | null | undefined): Hue {
  if (!role) return 'slate';
  return ROLE_FAMILIES.find((f) => f.roles.includes(role))?.hue ?? 'slate';
}

export function employmentHue(e: EmploymentType | null | undefined): Hue {
  switch (e) {
    case 'INTERNSHIP':
      return 'violet';
    case 'FULL_TIME':
      return 'blue';
    case 'CONTRACT':
    case 'FREELANCE':
      return 'amber';
    case 'PART_TIME':
      return 'teal';
    default:
      return 'slate';
  }
}

export function workModeHue(w: WorkMode | null | undefined): Hue {
  return w === 'REMOTE' ? 'green' : w === 'HYBRID' ? 'orange' : w === 'ONSITE' ? 'slate' : 'slate';
}

const COMPANY_HUES: Hue[] = ['blue', 'violet', 'teal', 'rose', 'orange', 'amber', 'green'];
/** Stable colour per company name (same company → same colour everywhere). */
export function companyHue(name: string): Hue {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COMPANY_HUES[h % COMPANY_HUES.length]!;
}
