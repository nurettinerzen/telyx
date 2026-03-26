import { describe, expect, it } from '@jest/globals';
import {
  resolveFlowScopedTools,
  isVerificationContextRelevant,
  shouldForceStockToolCall,
  buildFunctionCallingConfig
} from '../../src/core/orchestrator/steps/05_buildLLMRequest.js';

describe('flow scoped tool gating', () => {
  it('removes customer_data_lookup from PRODUCT_INFO flow', () => {
    const result = resolveFlowScopedTools({
      state: { activeFlow: 'PRODUCT_INFO' },
      classification: { suggestedFlow: 'PRODUCT_INFO' },
      routingResult: {},
      allToolNames: ['customer_data_lookup', 'get_product_stock', 'check_stock_crm', 'create_callback']
    });

    expect(result.resolvedFlow).toBe('PRODUCT_INFO');
    expect(result.gatedTools).toEqual(['get_product_stock', 'check_stock_crm']);
  });

  it('uses STOCK_CHECK override tools when classifier suggests stock flow', () => {
    const result = resolveFlowScopedTools({
      state: {},
      classification: { suggestedFlow: 'STOCK_CHECK' },
      routingResult: {},
      allToolNames: ['customer_data_lookup', 'get_product_stock', 'check_stock_crm']
    });

    expect(result.resolvedFlow).toBe('STOCK_CHECK');
    expect(result.gatedTools).toEqual(['get_product_stock', 'check_stock_crm']);
  });

  it('forces a tool call when stock flow is active and stock tools are available', () => {
    expect(shouldForceStockToolCall({
      resolvedFlow: 'STOCK_CHECK',
      gatedTools: ['get_product_stock', 'check_stock_crm']
    })).toBe(true);

    expect(buildFunctionCallingConfig({
      resolvedFlow: 'STOCK_CHECK',
      gatedTools: ['get_product_stock', 'check_stock_crm']
    })).toEqual({
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: ['get_product_stock', 'check_stock_crm']
      }
    });
  });

  it('keeps auto tool mode for non-stock flows', () => {
    expect(shouldForceStockToolCall({
      resolvedFlow: 'PRODUCT_INFO',
      gatedTools: ['get_product_stock']
    })).toBe(false);

    expect(buildFunctionCallingConfig({
      resolvedFlow: 'PRODUCT_INFO',
      gatedTools: ['get_product_stock']
    })).toEqual({
      functionCallingConfig: {
        mode: 'AUTO'
      }
    });
  });

  it('uses CALLBACK_REQUEST override for callback collection turns', () => {
    const result = resolveFlowScopedTools({
      state: { activeFlow: 'CALLBACK_REQUEST' },
      classification: {},
      routingResult: {},
      allToolNames: ['create_callback', 'customer_data_lookup', 'get_product_stock']
    });

    expect(result.resolvedFlow).toBe('CALLBACK_REQUEST');
    expect(result.gatedTools).toEqual(['create_callback']);
  });

  it('infers STOCK_CHECK from user message when no flow metadata exists', () => {
    const result = resolveFlowScopedTools({
      state: {},
      classification: {},
      routingResult: {},
      userMessage: 'Bu model stokta var mı, kaç tane kaldı?',
      allToolNames: ['customer_data_lookup', 'get_product_stock', 'check_stock_crm']
    });

    expect(result.resolvedFlow).toBe('STOCK_CHECK');
    expect(result.gatedTools).toEqual(['get_product_stock', 'check_stock_crm']);
  });

  it('infers STOCK_CHECK from natural availability phrasing without quantity words', () => {
    const result = resolveFlowScopedTools({
      state: {},
      classification: {},
      routingResult: {},
      userMessage: 'artemis var mi stokta',
      allToolNames: ['customer_data_lookup', 'get_product_stock', 'check_stock_crm']
    });

    expect(result.resolvedFlow).toBe('STOCK_CHECK');
    expect(result.gatedTools).toEqual(['get_product_stock', 'check_stock_crm']);
  });

  it('infers STOCK_CHECK from "mevcut mu" availability phrasing', () => {
    const result = resolveFlowScopedTools({
      state: {},
      classification: {},
      routingResult: {},
      userMessage: 'artemis mevcut mu',
      allToolNames: ['customer_data_lookup', 'get_product_stock', 'check_stock_crm']
    });

    expect(result.resolvedFlow).toBe('STOCK_CHECK');
    expect(result.gatedTools).toEqual(['get_product_stock', 'check_stock_crm']);
  });

  it('infers PRODUCT_INFO from user message when no flow metadata exists', () => {
    const result = resolveFlowScopedTools({
      state: {},
      classification: {},
      routingResult: {},
      userMessage: 'Ürün özellikleri ve garanti bilgisi nedir?',
      allToolNames: ['customer_data_lookup', 'get_product_stock', 'check_stock_crm']
    });

    expect(result.resolvedFlow).toBe('PRODUCT_INFO');
    expect(result.gatedTools).toEqual(['get_product_stock', 'check_stock_crm']);
  });

  it('bypasses flow-based gating in tenant_scoped mode', () => {
    const previousMode = process.env.TOOL_ALLOWLIST_MODE;
    process.env.TOOL_ALLOWLIST_MODE = 'tenant_scoped';

    try {
      const result = resolveFlowScopedTools({
        state: { activeFlow: 'PRODUCT_INFO' },
        classification: {},
        routingResult: {},
        allToolNames: ['customer_data_lookup', 'get_product_stock', 'check_stock_crm']
      });

      expect(result.resolvedFlow).toBe('PRODUCT_INFO');
      expect(result.gatedTools).toEqual(['customer_data_lookup', 'get_product_stock', 'check_stock_crm']);
      expect(result.allowlistMode).toBe('tenant_scoped');
    } finally {
      if (previousMode === undefined) {
        delete process.env.TOOL_ALLOWLIST_MODE;
      } else {
        process.env.TOOL_ALLOWLIST_MODE = previousMode;
      }
    }
  });

  it('disables inferFlowFromMessage in tenant_scoped mode', () => {
    const previousMode = process.env.TOOL_ALLOWLIST_MODE;
    process.env.TOOL_ALLOWLIST_MODE = 'tenant_scoped';

    try {
      const result = resolveFlowScopedTools({
        state: {},
        classification: {},
        routingResult: {},
        userMessage: 'Bu model stokta var mı, kaç tane kaldı?',
        allToolNames: ['customer_data_lookup', 'get_product_stock', 'check_stock_crm']
      });

      expect(result.resolvedFlow).toBe(null);
      expect(result.gatedTools).toEqual(['customer_data_lookup', 'get_product_stock', 'check_stock_crm']);
      expect(result.allowlistMode).toBe('tenant_scoped');
    } finally {
      if (previousMode === undefined) {
        delete process.env.TOOL_ALLOWLIST_MODE;
      } else {
        process.env.TOOL_ALLOWLIST_MODE = previousMode;
      }
    }
  });

  it('keeps verification context relevant when activeFlow is null but pending anchor exists', () => {
    const relevant = isVerificationContextRelevant({
      state: {
        activeFlow: null,
        verification: {
          status: 'pending',
          anchor: { id: 'anchor-1' }
        }
      },
      classification: {},
      routingResult: {}
    });

    expect(relevant).toBe(true);
  });

  it('skips verification context when stock context is active even if pending anchor exists', () => {
    const relevant = isVerificationContextRelevant({
      state: {
        activeFlow: null,
        anchor: { type: 'STOCK' },
        verification: {
          status: 'pending',
          anchor: { id: 'anchor-1' }
        }
      },
      classification: {},
      routingResult: {}
    });

    expect(relevant).toBe(false);
  });
});
