const AUTH_KEYS = [
  'admin_token',
  'auth_token',
  'agent_token',
  'portal_session_token',
  'portal_client_id',
  'portal_client_data',
  'admin_auth',
  'admin_email',
  'agent_data',
  'active_role',
];

export function updateStoredTokens(newToken: string, type: string): void {
  localStorage.setItem('auth_token', newToken);
  if (type === 'admin') {
    localStorage.setItem('admin_token', newToken);
  }
  if (type === 'agent') {
    localStorage.setItem('agent_token', newToken);
  }
  if (type === 'client') {
    localStorage.setItem('portal_session_token', newToken);
  }
}

export function clearAuthStorage(): void {
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key);
  }
}
