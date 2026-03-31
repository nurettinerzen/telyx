import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

const DEFAULTS = {
  adminEmail: 'c.gocebe@oksid.com.tr',
  adminName: 'IT Admin',
  adminRole: 'STAFF',
  secondaryAdminEmail: '',
  secondaryAdminName: 'Telyx Admin',
  secondaryAdminRole: 'STAFF',
  ownerEmail: 'test.owner@telyx.local',
  ownerName: 'Test Owner',
  businessName: 'IT Test Workspace',
  plan: 'PRO',
};

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [rawKey, ...rest] = arg.slice(2).split('=');
    const key = rawKey.trim();
    const value = rest.length > 0 ? rest.join('=') : 'true';
    acc[key] = value;
    return acc;
  }, {});
}

function makePassword(label) {
  const random = crypto.randomBytes(6).toString('base64url');
  return `Telyx!${label}${random}`;
}

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

async function ensureBusinessWithOwner({
  ownerEmail,
  ownerName,
  ownerPassword,
  businessName,
  plan,
}) {
  const existingOwner = await prisma.user.findUnique({
    where: { email: ownerEmail },
    include: {
      business: {
        include: {
          subscription: true
        }
      }
    }
  });

  if (existingOwner) {
    await prisma.user.update({
      where: { id: existingOwner.id },
      data: {
        role: 'OWNER',
        name: existingOwner.name || ownerName,
        emailVerified: true,
        emailVerifiedAt: existingOwner.emailVerifiedAt || new Date(),
        onboardingCompleted: true,
        acceptedAt: existingOwner.acceptedAt || new Date()
      }
    });

    if (!existingOwner.business?.subscription) {
      const now = new Date();
      await prisma.subscription.create({
        data: {
          businessId: existingOwner.businessId,
          plan,
          status: 'ACTIVE',
          paymentProvider: 'stripe',
          currentPeriodStart: now,
          currentPeriodEnd: addDays(now, 30),
          includedMinutesResetAt: addDays(now, 30),
          concurrentLimit: 2,
          assistantsLimit: 10,
          phoneNumbersLimit: 1
        }
      });
    }

    return {
      businessId: existingOwner.businessId,
      businessName: existingOwner.business?.name || businessName,
      ownerEmail,
      ownerPassword: null,
      ownerCreated: false
    };
  }

  const hashedPassword = await bcrypt.hash(ownerPassword, 10);
  const now = new Date();

  const business = await prisma.business.create({
    data: {
      name: businessName,
      chatEmbedKey: `emb_${crypto.randomBytes(16).toString('hex')}`,
      businessType: 'OTHER',
      country: 'TR',
      currency: 'TRY',
      language: 'TR',
      timezone: 'Europe/Istanbul',
      users: {
        create: {
          email: ownerEmail,
          password: hashedPassword,
          name: ownerName,
          role: 'OWNER',
          emailVerified: true,
          emailVerifiedAt: now,
          onboardingCompleted: true,
          acceptedAt: now
        }
      },
      subscription: {
        create: {
          plan,
          status: 'ACTIVE',
          paymentProvider: 'stripe',
          currentPeriodStart: now,
          currentPeriodEnd: addDays(now, 30),
          includedMinutesResetAt: addDays(now, 30),
          concurrentLimit: 2,
          assistantsLimit: 10,
          phoneNumbersLimit: 1
        }
      }
    }
  });

  return {
    businessId: business.id,
    businessName: business.name,
    ownerEmail,
    ownerPassword,
    ownerCreated: true
  };
}

async function ensureAdminAppUser({
  adminEmail,
  adminName,
  adminRole,
  businessId,
  adminPassword,
}) {
  const normalizedEmail = normalizeEmail(adminEmail);
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name: existingUser.name || adminName,
        emailVerified: true,
        emailVerifiedAt: existingUser.emailVerifiedAt || new Date(),
        onboardingCompleted: true,
        acceptedAt: existingUser.acceptedAt || new Date()
      }
    });

    return {
      adminEmail,
      adminPassword: null,
      adminUserCreated: false,
      businessId: existingUser.businessId,
      role: existingUser.role
    };
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password: hashedPassword,
      name: adminName,
      role: adminRole,
      businessId,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      onboardingCompleted: true,
      acceptedAt: new Date()
    }
  });

  return {
      adminEmail,
      adminPassword,
      adminUserCreated: true,
      businessId: user.businessId,
      role: user.role
    };
}

async function ensureAdminPanelUser({ adminEmail, adminName }) {
  const adminUser = await prisma.adminUser.upsert({
    where: { email: normalizeEmail(adminEmail) },
    create: {
      email: normalizeEmail(adminEmail),
      name: adminName,
      role: 'SUPER_ADMIN',
      isActive: true
    },
    update: {
      name: adminName,
      role: 'SUPER_ADMIN',
      isActive: true
    }
  });

  return adminUser;
}

async function renameUserEmailIfRequested({ fromEmail, toEmail }) {
  const from = normalizeEmail(fromEmail);
  const to = normalizeEmail(toEmail);

  if (!from || !to || from === to) {
    return { changed: false, reason: 'not_requested' };
  }

  const sourceUser = await prisma.user.findUnique({
    where: { email: from }
  });

  if (!sourceUser) {
    return { changed: false, reason: 'source_missing' };
  }

  const targetUser = await prisma.user.findUnique({
    where: { email: to }
  });

  if (targetUser && targetUser.id !== sourceUser.id) {
    throw new Error(`Target email already exists: ${to}`);
  }

  await prisma.user.update({
    where: { id: sourceUser.id },
    data: {
      email: to,
      emailVerified: true,
      emailVerifiedAt: sourceUser.emailVerifiedAt || new Date()
    }
  });

  const sourceAdmin = await prisma.adminUser.findUnique({
    where: { email: from }
  });

  if (sourceAdmin) {
    const targetAdmin = await prisma.adminUser.findUnique({
      where: { email: to }
    });

    if (!targetAdmin) {
      await prisma.adminUser.update({
        where: { id: sourceAdmin.id },
        data: {
          email: to,
          isActive: true
        }
      });
    } else {
      await prisma.adminUser.update({
        where: { id: targetAdmin.id },
        data: {
          role: 'SUPER_ADMIN',
          isActive: true
        }
      });
    }
  }

  return { changed: true, reason: 'renamed', from, to };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const renameFrom = args['rename-user-from'] || '';
  const renameTo = args['rename-user-to'] || '';
  const adminEmail = args['admin-email'] || DEFAULTS.adminEmail;
  const adminName = args['admin-name'] || DEFAULTS.adminName;
  const adminRole = args['admin-role'] || DEFAULTS.adminRole;
  const secondaryAdminEmail = args['secondary-admin-email'] || DEFAULTS.secondaryAdminEmail;
  const secondaryAdminName = args['secondary-admin-name'] || DEFAULTS.secondaryAdminName;
  const secondaryAdminRole = args['secondary-admin-role'] || DEFAULTS.secondaryAdminRole;
  const ownerEmail = args['owner-email'] || DEFAULTS.ownerEmail;
  const ownerName = args['owner-name'] || DEFAULTS.ownerName;
  const businessName = args['business-name'] || DEFAULTS.businessName;
  const plan = args.plan || DEFAULTS.plan;

  const renameResult = await renameUserEmailIfRequested({
    fromEmail: renameFrom,
    toEmail: renameTo
  });

  const generatedOwnerPassword = args['owner-password'] || makePassword('Owner');

  const ownerResult = await ensureBusinessWithOwner({
    ownerEmail,
    ownerName,
    ownerPassword: generatedOwnerPassword,
    businessName,
    plan
  });

  const adminSpecs = [
    {
      email: adminEmail,
      name: adminName,
      role: adminRole,
      password: args['admin-password'] || makePassword('AdminA')
    }
  ];

  if (normalizeEmail(secondaryAdminEmail)) {
    adminSpecs.push({
      email: secondaryAdminEmail,
      name: secondaryAdminName,
      role: secondaryAdminRole,
      password: args['secondary-admin-password'] || makePassword('AdminB')
    });
  }

  const adminResults = [];
  for (const adminSpec of adminSpecs) {
    const appUserResult = await ensureAdminAppUser({
      adminEmail: adminSpec.email,
      adminName: adminSpec.name,
      adminRole: adminSpec.role,
      businessId: ownerResult.businessId,
      adminPassword: adminSpec.password
    });

    const adminPanelUser = await ensureAdminPanelUser({
      adminEmail: adminSpec.email,
      adminName: adminSpec.name
    });

    adminResults.push({
      ...appUserResult,
      adminPanelRole: adminPanelUser.role,
      adminPanelEmail: adminPanelUser.email
    });
  }

  console.log('\n✅ IT access provisioning tamamlandı.\n');
  console.log(`İş alanı: ${ownerResult.businessName} (#${ownerResult.businessId})`);
  console.log(`Plan: ${plan}`);
  if (renameResult.changed) {
    console.log('');
    console.log('Email taşıma:');
    console.log(`- ${renameResult.from} -> ${renameResult.to}`);
  }
  console.log('');
  console.log('Owner kullanıcı:');
  console.log(`- Email: ${ownerResult.ownerEmail}`);
  console.log(`- Durum: ${ownerResult.ownerCreated ? 'oluşturuldu' : 'zaten vardı'}`);
  if (ownerResult.ownerPassword) {
    console.log(`- Geçici şifre: ${ownerResult.ownerPassword}`);
  } else {
    console.log('- Şifre: değişmedi (mevcut kullanıcı)');
  }
  console.log('');
  console.log('Whitelist admin kullanıcıları:');
  for (const adminResult of adminResults) {
    console.log(`- Email: ${adminResult.adminEmail}`);
    console.log(`  Uygulama rolü: ${adminResult.role}`);
    console.log(`  Admin panel yetkisi: ${adminResult.adminPanelRole}`);
    console.log(`  Durum: ${adminResult.adminUserCreated ? 'oluşturuldu' : 'zaten vardı'}`);
    if (adminResult.adminPassword) {
      console.log(`  Geçici şifre: ${adminResult.adminPassword}`);
    } else {
      console.log('  Şifre: değişmedi (mevcut kullanıcı)');
    }
  }
  console.log('');
  console.log('Notlar:');
  console.log('- Admin MFA kodu artık varsayılan olarak ilgili admin e-posta adresine gider.');
  console.log('- Eğer kullanıcı zaten varsa script şifreyi değiştirmez.');
  console.log(`- Render env: ADMIN_BOOTSTRAP_EMAILS=${adminResults.map((item) => normalizeEmail(item.adminEmail)).join(',')}`);
}

main()
  .catch((error) => {
    console.error('❌ IT access provisioning failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
