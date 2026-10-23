export function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}
