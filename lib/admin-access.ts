export function isManagementApi(pathname: string, method: string) {
  if (pathname.startsWith('/api/admin/') && pathname !== '/api/admin/auth') return true;
  return /^\/api\/items(?:\/|$)/.test(pathname) && method !== 'GET' && method !== 'HEAD';
}
