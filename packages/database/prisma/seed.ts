/**
 * Seeds configuration only: the verified source registry and the initial admin
 * account. It never creates jobs — all opportunities come from live sources.
 * Safe to run repeatedly (idempotent upserts; existing admin passwords untouched).
 */
import bcrypt from 'bcryptjs';
import { normalizeCompanyName } from '@beep/normalization';
import { prisma, SOURCE_REGISTRY } from '../src';
import { sourceIdFor } from '../src/source-registry';

async function main() {
  let sources = 0;
  for (const s of SOURCE_REGISTRY) {
    const company = normalizeCompanyName(s.companyName);
    const c = await prisma.company.upsert({
      where: { normalizedName: company.key },
      create: { name: company.display, normalizedName: company.key, slug: company.slug, website: s.website },
      update: { website: s.website ?? undefined },
    });
    const id = sourceIdFor(s.adapterType, s.boardToken);
    await prisma.jobSource.upsert({
      where: { id },
      create: {
        id,
        adapterType: s.adapterType,
        boardToken: s.boardToken,
        name: `${s.companyName} (${s.adapterType.charAt(0)}${s.adapterType.slice(1).toLowerCase()})`,
        companyId: c.id,
      },
      update: { companyId: c.id },
    });
    sources++;
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (!existing) {
      await prisma.adminUser.create({ data: { email, name: 'Administrator', passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } });
      console.log(`Created admin ${email}`);
    }
  } else {
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin account created.');
  }
  console.log(`Seeded ${sources} sources.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
