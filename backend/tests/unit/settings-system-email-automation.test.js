import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const prismaMock = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  }
};

const bcryptMock = {
  compare: jest.fn(),
  hash: jest.fn()
};

const emailServiceMock = {
  sendAccountDeletionConfirmationEmail: jest.fn(),
  sendPasswordChangedEmail: jest.fn()
};

const accountDeletionMock = {
  hardDeleteSelfUser: jest.fn(),
  hardDeleteWorkspaceForOwner: jest.fn(),
  isValidDeleteAccountConfirmation: jest.fn()
};

const issueSessionMock = jest.fn();
const clearSessionCookieMock = jest.fn();

jest.unstable_mockModule('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prismaMock)
}));

jest.unstable_mockModule('bcrypt', () => ({
  default: bcryptMock
}));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.userId = 7;
    req.businessId = 11;
    req.user = { id: 7, businessId: 11 };
    next();
  }
}));

jest.unstable_mockModule('../../src/middleware/reauth.js', () => ({
  requireRecentAuth: () => (req, res, next) => next()
}));

jest.unstable_mockModule('../../src/security/passwordPolicy.js', () => ({
  validatePasswordPolicy: jest.fn(() => ({ valid: true })),
  passwordPolicyMessage: jest.fn(() => 'ok')
}));

jest.unstable_mockModule('../../src/security/sessionToken.js', () => ({
  clearSessionCookie: clearSessionCookieMock,
  issueSession: issueSessionMock
}));

jest.unstable_mockModule('../../src/services/emailService.js', () => emailServiceMock);

jest.unstable_mockModule('../../src/services/accountDeletion.js', () => accountDeletionMock);

let router;

beforeAll(async () => {
  ({ default: router } = await import('../../src/routes/settings.js'));
});

describe('settings system email automations', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/settings', router);

    bcryptMock.compare.mockResolvedValue(true);
    bcryptMock.hash.mockResolvedValue('new-hash');
    issueSessionMock.mockImplementation(() => {});
    clearSessionCookieMock.mockImplementation(() => {});
    emailServiceMock.sendPasswordChangedEmail.mockResolvedValue({ sent: true });
    emailServiceMock.sendAccountDeletionConfirmationEmail.mockResolvedValue({ sent: true });
    accountDeletionMock.isValidDeleteAccountConfirmation.mockReturnValue(true);
    accountDeletionMock.hardDeleteSelfUser.mockResolvedValue();
    accountDeletionMock.hardDeleteWorkspaceForOwner.mockResolvedValue();
  });

  it('sends a password-changed email after a dashboard password change', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'owner@example.com',
      name: 'Owner',
      password: 'old-hash'
    });
    prismaMock.user.update.mockResolvedValue({
      id: 7,
      email: 'owner@example.com',
      role: 'OWNER',
      businessId: 11,
      tokenVersion: 2
    });

    const response = await request(app)
      .post('/api/settings/change-password')
      .send({
        currentPassword: 'old-password',
        newPassword: 'NewPassword123!',
        terminateAllSessions: true
      });

    expect(response.status).toBe(200);
    expect(emailServiceMock.sendPasswordChangedEmail).toHaveBeenCalledWith({
      email: 'owner@example.com',
      name: 'Owner'
    });
  });

  it('sends an account deletion confirmation after account deletion', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'staff@example.com',
      name: 'Staff',
      password: 'old-hash',
      role: 'STAFF',
      businessId: 11
    });

    const response = await request(app)
      .post('/api/settings/delete-account')
      .send({
        currentPassword: 'old-password',
        confirmationText: 'delete my account'
      });

    expect(response.status).toBe(200);
    expect(accountDeletionMock.hardDeleteSelfUser).toHaveBeenCalledWith(7);
    expect(emailServiceMock.sendAccountDeletionConfirmationEmail).toHaveBeenCalledWith({
      email: 'staff@example.com',
      name: 'Staff'
    });
  });
});
