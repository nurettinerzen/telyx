import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

const DEFAULTS = {
  adminEmail: 'c.gocebe@oksid.com.tr',
  adminName: 'IT Admin',
  adminRole: 'STAFF',
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
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail }
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
      businessId: existingUser.businessId
    };
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const user = await prisma.user.create({
    data: {
      email: adminEmail,
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
    businessId: user.businessId
  };
}

async function ensureAdminPanelUser({ adminEmail, adminName }) {
  const adminUser = await prisma.adminUser.upsert({
    where: { email: adminEmail.toLowerCase() },
    create: {
      email: adminEmail.toLowerCase(),
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adminEmail = args['admin-email'] || DEFAULTS.adminEmail;
  const adminName = args['admin-name'] || DEFAULTS.adminName;
  const adminRole = args['admin-role'] || DEFAULTS.adminRole;
  const ownerEmail = args['owner-email'] || DEFAULTS.ownerEmail;
  const ownerName = args['owner-name'] || DEFAULTS.ownerName;
  const businessName = args['business-name'] || DEFAULTS.businessName;
  const plan = args.plan || DEFAULTS.plan;

  const generatedOwnerPassword = args['owner-password'] || makePassword('Owner');
  const generatedAdminPassword = args['admin-password'] || makePassword('Admin');

  const ownerResult = await ensureBusinessWithOwner({
    ownerEmail,
    ownerName,
    ownerPassword: generatedOwnerPassword,
    businessName,
    plan
  });

  const adminResult = await ensureAdminAppUser({
    adminEmail,
    adminName,
    adminRole,
    businessId: ownerResult.businessId,
    adminPassword: generatedAdminPassword
  });

  const adminPanelUser = await ensureAdminPanelUser({
    adminEmail,
    adminName
  });

  console.log('\n✅ IT access provisioning tamamlandı.\n');
  console.log(`İş alanı: ${ownerResult.businessName} (#${ownerResult.businessId})`);
  console.log(`Plan: ${plan}`);
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
  console.log('Whitelist admin uygulama kullanıcısı:');
  console.log(`- Email: ${adminResult.adminEmail}`);
  console.log(`- Rol: ${adminRole}`);
  console.log(`- Durum: ${adminResult.adminUserCreated ? 'oluşturuldu' : 'zaten vardı'}`);
  if (adminResult.adminPassword) {
    console.log(`- Geçici şifre: ${adminResult.adminPassword}`);
  } else {
    console.log('- Şifre: değişmedi (mevcut kullanıcı)');
  }
  console.log('');
  console.log('Admin panel erişimi:');
  console.log(`- AdminUser: ${adminPanelUser.email}`);
  console.log(`- Yetki: ${adminPanelUser.role}`);
  console.log('');
  console.log('Notlar:');
  console.log('- Admin MFA kodu artık varsayılan olarak ilgili admin e-posta adresine gider.');
  console.log('- Eğer kullanıcı zaten varsa script şifreyi değiştirmez.');
}

main()
  .catch((error) => {
    console.error('❌ IT access provisioning failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
