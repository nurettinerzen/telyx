import prisma from '../prismaClient.js';

export const BRAND_OWNER_EMAIL = String(
  process.env.PUBLIC_CONTACT_OWNER_EMAIL || 'info@telyx.ai'
).trim().toLowerCase();

function sortPhoneNumbers(numbers = []) {
  return [...numbers].sort((a, b) => (
    Number(Boolean(b.isPublicContact)) - Number(Boolean(a.isPublicContact))
    || Number(Boolean(b.isDefaultInbound)) - Number(Boolean(a.isDefaultInbound))
    || Number(Boolean(b.isDefaultOutbound)) - Number(Boolean(a.isDefaultOutbound))
    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  ));
}

async function getActivePhoneNumbers(tx, businessId) {
  return tx.phoneNumber.findMany({
    where: { businessId, status: 'ACTIVE' },
    select: {
      id: true,
      phoneNumber: true,
      isDefaultInbound: true,
      isDefaultOutbound: true,
      isPublicContact: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' }
  });
}

async function enforceSingleFlag(tx, businessId, field, selectedId) {
  await tx.phoneNumber.updateMany({
    where: { businessId, status: 'ACTIVE' },
    data: { [field]: false }
  });

  if (!selectedId) return;

  await tx.phoneNumber.update({
    where: { id: selectedId },
    data: { [field]: true }
  });
}

export async function hasBrandPhoneOverride(tx, businessId) {
  if (!businessId) return false;

  const owner = await tx.user.findFirst({
    where: {
      businessId,
      email: {
        equals: BRAND_OWNER_EMAIL,
        mode: 'insensitive'
      }
    },
    select: { id: true }
  });

  return Boolean(owner);
}

export async function resolveEffectivePhoneNumberLimit(tx, businessId) {
  if (!businessId) return 0;

  const [subscription, brandOverride] = await Promise.all([
    tx.subscription.findUnique({
      where: { businessId },
      select: { phoneNumbersLimit: true }
    }),
    hasBrandPhoneOverride(tx, businessId)
  ]);

  if (brandOverride) return -1;
  return Number.isInteger(subscription?.phoneNumbersLimit) ? subscription.phoneNumbersLimit : 0;
}

export async function reconcilePhoneNumberUsage(tx, businessId) {
  if (!businessId) return 0;

  const activeCount = await tx.phoneNumber.count({
    where: { businessId, status: 'ACTIVE' }
  });

  await tx.subscription.updateMany({
    where: { businessId },
    data: { phoneNumbersUsed: activeCount }
  });

  return activeCount;
}

export async function syncLegacyBusinessPhoneFields(tx, businessId) {
  if (!businessId) return [];

  const activeNumbers = await getActivePhoneNumbers(tx, businessId);

  if (activeNumbers.length === 0) {
    await tx.business.update({
      where: { id: businessId },
      data: {
        ownerPhone: null,
        phoneNumbers: []
      }
    });
    return [];
  }

  const firstNumberId = activeNumbers[0].id;
  const inboundId = activeNumbers.find((item) => item.isDefaultInbound)?.id || firstNumberId;
  const publicId = activeNumbers.find((item) => item.isPublicContact)?.id || inboundId;
  const outboundId = activeNumbers.find((item) => item.isDefaultOutbound)?.id || publicId;

  await enforceSingleFlag(tx, businessId, 'isDefaultInbound', inboundId);
  await enforceSingleFlag(tx, businessId, 'isPublicContact', publicId);
  await enforceSingleFlag(tx, businessId, 'isDefaultOutbound', outboundId);

  const normalizedNumbers = await getActivePhoneNumbers(tx, businessId);
  const ordered = sortPhoneNumbers(normalizedNumbers);
  const primaryPhone = ordered[0]?.phoneNumber || null;

  await tx.business.update({
    where: { id: businessId },
    data: {
      ownerPhone: primaryPhone,
      phoneNumbers: ordered.map((item) => item.phoneNumber)
    }
  });

  return ordered;
}

export async function setPhoneNumberRoutingFlags(
  tx,
  {
    businessId,
    phoneNumberId,
    isDefaultInbound,
    isDefaultOutbound,
    isPublicContact
  }
) {
  const phoneNumber = await tx.phoneNumber.findFirst({
    where: {
      id: phoneNumberId,
      businessId,
      status: 'ACTIVE'
    }
  });

  if (!phoneNumber) {
    throw new Error('PHONE_NUMBER_NOT_FOUND');
  }

  const updateData = {};

  if (typeof isDefaultInbound === 'boolean') {
    if (isDefaultInbound) {
      await tx.phoneNumber.updateMany({
        where: { businessId, status: 'ACTIVE' },
        data: { isDefaultInbound: false }
      });
    }
    updateData.isDefaultInbound = isDefaultInbound;
  }

  if (typeof isDefaultOutbound === 'boolean') {
    if (isDefaultOutbound) {
      await tx.phoneNumber.updateMany({
        where: { businessId, status: 'ACTIVE' },
        data: { isDefaultOutbound: false }
      });
    }
    updateData.isDefaultOutbound = isDefaultOutbound;
  }

  if (typeof isPublicContact === 'boolean') {
    if (isPublicContact) {
      await tx.phoneNumber.updateMany({
        where: { businessId, status: 'ACTIVE' },
        data: { isPublicContact: false }
      });
    }
    updateData.isPublicContact = isPublicContact;
  }

  if (Object.keys(updateData).length > 0) {
    await tx.phoneNumber.update({
      where: { id: phoneNumberId },
      data: updateData
    });
  }

  const ordered = await syncLegacyBusinessPhoneFields(tx, businessId);
  return ordered.find((item) => item.id === phoneNumberId) || null;
}

export async function getPublicContactProfile(tx = prisma) {
  const owner = await tx.user.findFirst({
    where: {
      email: {
        equals: BRAND_OWNER_EMAIL,
        mode: 'insensitive'
      }
    },
    select: {
      email: true,
      businessId: true,
      business: {
        select: {
          id: true,
          ownerPhone: true,
          businessHours: {
            select: { id: true }
          }
        }
      }
    }
  });

  if (!owner?.businessId) {
    return {
      email: BRAND_OWNER_EMAIL,
      phone: null,
      businessId: null
    };
  }

  const activeNumbers = await tx.phoneNumber.findMany({
    where: { businessId: owner.businessId, status: 'ACTIVE' },
    select: {
      phoneNumber: true,
      isPublicContact: true,
      isDefaultInbound: true,
      isDefaultOutbound: true,
      createdAt: true
    }
  });

  const ordered = sortPhoneNumbers(activeNumbers);

  return {
    email: owner.email || BRAND_OWNER_EMAIL,
    phone: ordered[0]?.phoneNumber || owner.business?.ownerPhone || null,
    businessId: owner.businessId
  };
}
