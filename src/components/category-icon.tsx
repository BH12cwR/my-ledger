import {
  Banknote,
  Briefcase,
  Building2,
  Bus,
  CircleEllipsis,
  CircleHelp,
  Gamepad2,
  Gift,
  GraduationCap,
  Hammer,
  HeartPulse,
  House,
  Landmark,
  MessageCircle,
  PawPrint,
  Plane,
  RotateCcw,
  ShoppingBag,
  Smartphone,
  Tag,
  TrendingUp,
  Trophy,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 分类 / 账户图标。
 *
 * 数据库里存的是稳定的 kebab-case 名称（如 "shopping-bag"），
 * 这里维护一份显式白名单而不是引入 lucide 全量 icons 对象，
 * 避免把一个 1800+ 图标的字典打进首屏 bundle。
 */
const ICON_MAP: Record<string, LucideIcon> = {
  banknote: Banknote,
  briefcase: Briefcase,
  "building-2": Building2,
  bus: Bus,
  "circle-ellipsis": CircleEllipsis,
  "circle-help": CircleHelp,
  "gamepad-2": Gamepad2,
  gift: Gift,
  "graduation-cap": GraduationCap,
  hammer: Hammer,
  "heart-pulse": HeartPulse,
  house: House,
  landmark: Landmark,
  "message-circle": MessageCircle,
  "paw-print": PawPrint,
  plane: Plane,
  "rotate-ccw": RotateCcw,
  "shopping-bag": ShoppingBag,
  smartphone: Smartphone,
  tag: Tag,
  "trending-up": TrendingUp,
  trophy: Trophy,
  utensils: Utensils,
  wallet: Wallet,
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) return CircleHelp;
  return ICON_MAP[name] ?? CircleHelp;
}

export function CategoryIcon({
  name,
  className,
  color,
}: {
  name: string | null | undefined;
  className?: string;
  color?: string | null;
}) {
  const Icon = categoryIcon(name);
  return (
    <Icon
      className={cn("size-4 shrink-0", className)}
      style={color ? { color } : undefined}
      aria-hidden
    />
  );
}

/** 圆形色块图标，列表与图表图例复用 */
export function CategoryBadge({
  icon,
  color,
  className,
}: {
  icon: string | null | undefined;
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
        className,
      )}
      style={{ backgroundColor: `${color ?? "#94a3b8"}1f` }}
    >
      <CategoryIcon name={icon} color={color} />
    </span>
  );
}