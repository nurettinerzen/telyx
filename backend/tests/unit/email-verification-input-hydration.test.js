import { describe, expect, it } from '@jest/globals';
import {
  extractVerificationInputFromText,
  hydrateLookupArgsWithVerificationInput
} from '../../src/core/email/steps/06_generateDraft.js';

describe('email verification_input hydration', () => {
  it('extracts plain 4-digit verification input', () => {
    expect(extractVerificationInputFromText('4299', 'phone_last4')).toBe('4299');
  });

  it('extracts contextual 4-digit verification input', () => {
    expect(
      extractVerificationInputFromText('Telefonumun son 4 hanesi 5005', 'phone_last4')
    ).toBe('5005');
  });

  it('does not misread order number text as phone last4 input', () => {
    expect(
      extractVerificationInputFromText('ORD-202659786 siparisim acil', 'phone_last4')
    ).toBeNull();
  });

  it('hydrates customer_data_lookup args when verification is pending', () => {
    const hydrated = hydrateLookupArgsWithVerificationInput({
      toolName: 'customer_data_lookup',
      toolArgs: { query_type: 'siparis', order_number: 'ORD-202659786' },
      emailState: {
        verification: {
          status: 'pending',
          pendingField: 'phone_last4'
        }
      },
      inboundMessage: {
        bodyText: '4299'
      },
      threadMessages: []
    });

    expect(hydrated.hydrated).toBe(true);
    expect(hydrated.args.verification_input).toBe('4299');
  });

  it('hydrates using legacy verification state fields', () => {
    const hydrated = hydrateLookupArgsWithVerificationInput({
      toolName: 'customer_data_lookup',
      toolArgs: { query_type: 'siparis', order_number: 'ORD-202659786' },
      emailState: {
        verificationStatus: 'pending',
        verificationAnchor: { phone: '+905551112299' }
      },
      inboundMessage: {
        bodyText: '2299'
      },
      threadMessages: []
    });

    expect(hydrated.hydrated).toBe(true);
    expect(hydrated.args.verification_input).toBe('2299');
  });

  it('hydrates from tool args when LLM places last4 under phone', () => {
    const hydrated = hydrateLookupArgsWithVerificationInput({
      toolName: 'customer_data_lookup',
      toolArgs: { query_type: 'siparis', phone: '5005' },
      emailState: {
        verification: {
          status: 'pending',
          pendingField: 'phone_last4'
        }
      },
      inboundMessage: {
        bodyText: 'Merhaba'
      },
      threadMessages: []
    });

    expect(hydrated.hydrated).toBe(true);
    expect(hydrated.args.verification_input).toBe('5005');
  });

  it('does not override existing verification_input', () => {
    const hydrated = hydrateLookupArgsWithVerificationInput({
      toolName: 'customer_data_lookup',
      toolArgs: {
        query_type: 'siparis',
        order_number: 'ORD-202659786',
        verification_input: '1234'
      },
      emailState: {
        verification: {
          status: 'pending',
          pendingField: 'phone_last4'
        }
      },
      inboundMessage: {
        bodyText: '4299'
      },
      threadMessages: []
    });

    expect(hydrated.hydrated).toBe(false);
    expect(hydrated.args.verification_input).toBe('1234');
  });
});
