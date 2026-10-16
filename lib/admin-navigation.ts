import { ClipboardList, Coins, LayoutDashboard, MessageSquare, Package, Receipt, Repeat2, ScrollText, Users, Vault, type LucideIcon } from 'lucide-react';

export type NotificationKey = 'items' | 'reimbursements' | 'transactions' | 'users' | 'points' | 'requests' | 'legacy';
export type SidebarNotifications = Record<NotificationKey, number>;
type AdminNavItem = { href: string; label: string; icon: LucideIcon; notificationKey?: NotificationKey };

export const ADMIN_NAVIGATION: { label: string; items: AdminNavItem[] }[] = [
  { label: '基本', items: [{ href: '/admin', label: '管理トップ', icon: LayoutDashboard }] },
  { label: '日常業務', items: [
    { href: '/admin/items', label: '商品管理', icon: Package, notificationKey: 'items' },
    { href: '/admin/subscriptions', label: 'サブスク管理', icon: Repeat2 },
    { href: '/admin/reimbursements', label: '立替管理', icon: ClipboardList, notificationKey: 'reimbursements' },
    { href: '/admin/transactions', label: '取引履歴', icon: Receipt, notificationKey: 'transactions' },
    { href: '/admin/cashbox', label: '金庫確認', icon: Vault },
  ] },
  { label: '運営', items: [
    { href: '/admin/users', label: 'ユーザー管理', icon: Users, notificationKey: 'users' },
    { href: '/admin/points', label: 'ポイント管理', icon: Coins, notificationKey: 'points' },
    { href: '/admin/requests', label: '商品要望', icon: MessageSquare, notificationKey: 'requests' },
    { href: '/admin/legacy', label: '旧データ移行', icon: ClipboardList, notificationKey: 'legacy' },
    { href: '/admin/audit', label: '監査ログ', icon: ScrollText },
  ] },
];
