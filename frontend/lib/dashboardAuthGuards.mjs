const BILLING_RETURN_PARAM_KEYS = ['session_id', 'wallet_topup', 'addon', 'success', 'status'];

export function shouldBypassEmailVerificationForRoute(pathname = '', search = '') {
  if (pathname === '/dashboard/subscription/callback') {
    return true;
  }

  if (pathname !== '/dashboard/subscription') {
    return false;
  }

  const params = new URLSearchParams(search || '');
  return BILLING_RETURN_PARAM_KEYS.some((key) => {
    const value = params.get(key);
    return typeof value === 'string' && value.length > 0;
  });
}
