#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const targetEmail = String(process.env.TARGET_EMAIL || 'info@telyx.ai').trim().toLowerCase();

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

async function main() {
  console.log(`Inspecting admin access for ${targetEmail}`);

  const [user, adminUser] = await Promise.all([
    prisma.user.findUnique({
      where: { email: targetEmail },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        businessId: true,
        suspended: true,
        deletedAt: true,
        createdAt: true,
        business: {
          select: {
            name: true,
            timezone: true,
          },
        },
      },
    }),
    prisma.adminUser.findUnique({
      where: { email: targetEmail },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
      },
    }),
  ]);

  console.log('\n=== User row ===');
  if (!user) {
    console.log('No User row found.');
  } else {
    console.log(JSON.stringify({
      id: user.id,
      email: maskEmail(user.email),
      name: user.name,
      role: user.role,
      businessId: user.businessId,
      businessName: user.business?.name || null,
      timezone: user.business?.timezone || null,
      suspended: user.suspended,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
    }, null, 2));
  }

  console.log('\n=== AdminUser row ===');
  if (!adminUser) {
    console.log('No AdminUser row found.');
  } else {
    console.log(JSON.stringify({
      id: adminUser.id,
      email: maskEmail(adminUser.email),
      name: adminUser.name,
      role: adminUser.role,
      isActive: adminUser.isActive,
      createdAt: adminUser.createdAt,
      updatedAt: adminUser.updatedAt,
      lastLogin: adminUser.lastLogin,
    }, null, 2));
  }

  console.log('\n=== Diagnosis ===');
  if (!user) {
    console.log('This email does not have a normal app user row, so login/admin access cannot work.');
    return;
  }

  if (!adminUser) {
    console.log('The user exists, but there is no AdminUser row. Admin pages will return 403 unless the runtime bootstrap admin env explicitly auto-creates it.');
    return;
  }

  if (!adminUser.isActive) {
    console.log('The user has an AdminUser row, but it is inactive. Admin pages will return 403.');
    return;
  }

  console.log('The user has an active AdminUser row. If admin pages still do not show, the remaining cause is MFA/session state or UI entrypoint behavior.');
}

main()
  .catch((error) => {
    console.error(`Admin access inspection failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
