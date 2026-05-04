import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const resendSendMock = jest.fn();

jest.unstable_mockModule('resend', () => ({
  Resend: jest.fn(() => ({
    emails: {
      send: resendSendMock
    }
  }))
}));

let emailService;

beforeAll(async () => {
  process.env.RESEND_API_KEY = 're_test_mock';
  process.env.FRONTEND_URL = 'https://telyx.ai';
  process.env.SITE_URL = 'https://telyx.ai';
  process.env.SYSTEM_NOTIFICATION_FROM_EMAIL = 'Telyx Bildirim Merkezi <notifications@telyx.ai>';

  emailService = await import('../../src/services/emailService.js');
});

beforeEach(() => {
  resendSendMock.mockReset();
  resendSendMock.mockResolvedValue({ data: { id: 'email_test_123' } });
});

const expectSystemEmailPayload = ({ to, subjectIncludes, htmlIncludes, link }) => {
  expect(resendSendMock).toHaveBeenCalledTimes(1);

  const payload = resendSendMock.mock.calls[0][0];
  expect(payload.from).toBe('Telyx Bildirim Merkezi <notifications@telyx.ai>');
  expect(payload.to).toEqual([to]);
  expect(payload.subject).toContain(subjectIncludes);
  expect(payload.html).toContain('Telyx Bildirim Merkezi');
  expect(payload.html).toContain(htmlIncludes);
  expect(payload.html).toContain(link);
  expect(payload.html).not.toContain('{{');
  expect(payload.html).not.toContain('telyx-logo.png');
  expect(payload.html).not.toContain('telyx-icon.png');
  expect(payload.html).not.toContain('Telyx Bildirimleri');

  return payload;
};

describe('system email templates and send payloads', () => {
  it('sends the email verification template through Resend', async () => {
    const link = 'https://telyx.ai/auth/verify-email#token=verify_123';

    await expect(emailService.sendVerificationEmail('verify@example.com', link, 'Acme')).resolves.toEqual({
      sent: true,
      id: 'email_test_123'
    });

    expectSystemEmailPayload({
      to: 'verify@example.com',
      subjectIncludes: 'E-posta adresinizi doğrulayın',
      htmlIncludes: 'E-postamı Doğrula',
      link
    });
  });

  it('sends the password reset template through Resend', async () => {
    const link = 'https://telyx.ai/reset-password#token=reset_123';

    await emailService.sendPasswordResetEmail('reset@example.com', link);

    expectSystemEmailPayload({
      to: 'reset@example.com',
      subjectIncludes: 'Şifre sıfırlama',
      htmlIncludes: 'Şifremi Sıfırla',
      link
    });
  });

  it('sends the password changed notification through Resend', async () => {
    const link = 'https://telyx.ai/dashboard/settings';

    await emailService.sendPasswordChangedEmail({
      email: 'changed@example.com',
      name: 'Acme',
      securityUrl: link
    });

    expectSystemEmailPayload({
      to: 'changed@example.com',
      subjectIncludes: 'Şifreniz değiştirildi',
      htmlIncludes: 'Güvenlik Ayarlarını Aç',
      link
    });
  });

  it('sends the email-change verification template through Resend', async () => {
    const link = 'https://telyx.ai/auth/verify-email#token=email_change_123';

    await emailService.sendEmailChangeVerification('new@example.com', link, 'Acme');

    const payload = expectSystemEmailPayload({
      to: 'new@example.com',
      subjectIncludes: 'Yeni e-posta adresinizi doğrulayın',
      htmlIncludes: 'Yeni E-postamı Doğrula',
      link
    });
    expect(payload.html).toContain('new@example.com');
  });

  it('sends the team invitation template through Resend', async () => {
    const link = 'https://telyx.ai/invitation#token=invite_123';

    await emailService.sendTeamInvitationEmail({
      email: 'invite@example.com',
      inviterName: 'Nurettin',
      businessName: 'Acme',
      role: 'MANAGER',
      invitationUrl: link
    });

    const payload = expectSystemEmailPayload({
      to: 'invite@example.com',
      subjectIncludes: 'Acme için takım daveti',
      htmlIncludes: 'Daveti Kabul Et',
      link
    });
    expect(payload.html).toContain('Yönetici');
  });

  it('sends the account deletion confirmation through Resend', async () => {
    await emailService.sendAccountDeletionConfirmationEmail({
      email: 'deleted@example.com',
      name: 'Acme'
    });

    expectSystemEmailPayload({
      to: 'deleted@example.com',
      subjectIncludes: 'Hesap silme',
      htmlIncludes: 'Hesap silme işlemi tamamlandı',
      link: 'https://telyx.ai'
    });
  });

  it('sends the subscription cancellation confirmation through Resend', async () => {
    const link = 'https://telyx.ai/dashboard/subscription';

    await emailService.sendSubscriptionCancellationScheduledEmail({
      email: 'cancel@example.com',
      name: 'Acme',
      planName: 'Profesyonel',
      cancelAt: new Date('2026-06-01T10:00:00.000Z'),
      billingUrl: link
    });

    const payload = expectSystemEmailPayload({
      to: 'cancel@example.com',
      subjectIncludes: 'Abonelik iptali planlandı',
      htmlIncludes: 'Abonelik Ayarlarını Aç',
      link
    });
    expect(payload.html).toContain('Profesyonel');
  });
});
