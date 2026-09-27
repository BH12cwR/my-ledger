"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartPie, House, Plus, ReceiptText, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "首页", icon: House },
  { href: "/transactions", label: "明细", icon: ReceiptText },
  { href: "/stats", label: "统计", icon: ChartPie },
  { href: "/settings", label: "我的", icon: UserRound },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 移动端底部导航：四个主入口 + 居中的「记一笔」快捷按钮。
 * 这是 PWA 的主交互骨架，桌面端同样居中收窄展示。
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[env(safe-area-inset-bottom)]">
      <div className="pointer-events-auto relative mb-3 flex w-[min(28rem,calc(100%-2rem))] items-center justify-between rounded-2xl border border-border/60 bg-background/85 px-2 py-1.5 shadow-lg backdrop-blur">
        {ITEMS.slice(0, 2).map((item) => (
          <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}

        <Link
          href="/transactions/new"
          aria-label="记一笔"
          className="mx-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:translate-y-px"
        >
          <Plus className="size-5" />
        </Link>

        {ITEMS.slice(2).map((item) => (
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
  icon: typeof House;
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