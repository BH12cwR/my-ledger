import { cn } from "@/lib/utils";

/**
 * 详情弹窗里的「标签 / 值」行。
 *
 * mono 用于金额、笔数这类需要数字对齐的值；普通文本保持默认字体以免过度强调。
 */
export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("max-w-[60%] truncate text-right", mono && "font-mono tabular-nums")}>
        {value}
      </span>
    </div>
  );
}
