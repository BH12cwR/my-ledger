"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, ReceiptText, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "账单", icon: ReceiptText },
  { href: "/assets", label: "资产", icon: Wallet },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 移动端底部导航：`账单 / + / 资产` 三项，中间是「记一笔」FAB。
 *
 * 只在账单页与资产页这两个 Tab 根路径渲染（判断在 AppShell），
 * 二级页是全屏推入页、不带导航。其余入口上移到账单页顶栏的四个图标。
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[env(safe-area-inset-bottom)]">
      <div className="pointer-events-auto relative mb-3 flex w-[min(28rem,calc(100%-2rem))] items-center justify-between rounded-2xl border border-border/60 bg-background/85 px-2 py-1.5 shadow-lg backdrop-blur">
        {ITEMS.slice(0, 1).map((item) => (
          <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}

        <Link
          href="/transactions/new"
          aria-label="记一笔"
          className="mx-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:translate-y-px"
        >
          <Plus className="size-5" />
        </Link>

        {ITEMS.slice(1).map((item) => (
          <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-5" />
      <span>{label}</span>
    </Link>
  );
}