import { ClipboardList, Coins, LayoutDashboard, MessageSquare, Package, Receipt, Search, Repeat2, ScrollText, Users, Vault, type LucideIcon } from 'lucide-react';

export type NotificationKey = 'items' | 'reimbursements' | 'transactions' | 'users' | 'points' | 'requests' | 'legacy';
export type SidebarNotifications = Record<NotificationKey, number>;
type AdminNavItem = { href: string; label: string; icon: LucideIcon; notificationKey?: NotificationKey; activePaths?: string[] };

export const ADMIN_NAVIGATION: { label: string; items: AdminNavItem[] }[] = [
  { label: '基本', items: [{ href: '/admin', label: '管理トップ', icon: LayoutDashboard }] },
  { label: '商品', items: [
    { href: '/admin/items', label: '商品一覧', icon: Package, notificationKey: 'items' },
    { href: '/admin/subscriptions', label: 'サブスク商品', icon: Repeat2 },
    { href: '/admin/requests', label: '商品要望', icon: MessageSquare, notificationKey: 'requests' },
    { href: '/admin/price-watch', label: '価格監視', icon: Search },
  ] },
  { label: '利用者', items: [{ href: '/admin/users', label: '利用者一覧', icon: Users, notificationKey: 'users' }] },
  { label: '会計', items: [
    { href: '/admin/transactions', label: '取引', icon: Receipt, notificationKey: 'transactions', activePaths: ['/admin/orders'] },
    { href: '/admin/reimbursements', label: '仕入れ・立替', icon: ClipboardList, notificationKey: 'reimbursements' },
    { href: '/admin/cashbox', label: '金庫・出納', icon: Vault },
  ] },
  { label: '設定・記録', items: [
    { href: '/admin/points', label: 'ポイント制度', icon: Coins, notificationKey: 'points' },
    { href: '/admin/legacy', label: '旧データ移行', icon: ClipboardList, notificationKey: 'legacy' },
    { href: '/admin/audit', label: '監査ログ', icon: ScrollText },
  ] },
];
