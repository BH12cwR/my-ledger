"use client";

import { Delete, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 记账页底部数字键盘。
 *
 * 只做「按键 → 回调」的转发，表达式拼接与求值由记账页自己维护，
 * 这样键盘可以复用到任何需要底部数字输入的面板。
 * `−` / `+` 是计算器运算符（支持 "12.30+5-3" 这样的连续算式）。
 */
export function NumberKeypad({
  onDigit,
  onDot,
  onOperator,
  onDelete,
  onSave,
  onSaveAndNew,
  saving = false,
}: {
  onDigit: (digit: string) => void;
  onDot: () => void;
  onOperator: (operator: "+" | "-") => void;
  onDelete: () => void;
  onSave: () => void;
  /** 传入时渲染「再记」键（仅新增模式）；编辑模式不传，用占位保持网格对齐 */
  onSaveAndNew?: () => void;
  saving?: boolean;
}) {
  const disabled = saving;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-sm">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-4 gap-1.5 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {["1", "2", "3"].map((digit) => (
          <KeypadButton key={digit} onClick={() => onDigit(digit)}>
            {digit}
          </KeypadButton>
        ))}
        <KeypadButton aria-label="删除" onClick={onDelete}>
          <Delete className="size-5" />
        </KeypadButton>

        {["4", "5", "6"].map((digit) => (
          <KeypadButton key={digit} onClick={() => onDigit(digit)}>
            {digit}
          </KeypadButton>
        ))}
        <KeypadButton aria-label="减" onClick={() => onOperator("-")}>
          −
        </KeypadButton>

        {["7", "8", "9"].map((digit) => (
          <KeypadButton key={digit} onClick={() => onDigit(digit)}>
            {digit}
          </KeypadButton>
        ))}
        <KeypadButton aria-label="加" onClick={() => onOperator("+")}>
          +
        </KeypadButton>

        {onSaveAndNew ? (
          <KeypadButton variant="muted" disabled={disabled} onClick={onSaveAndNew}>
            再记
          </KeypadButton>
        ) : (
          <span aria-hidden />
        )}
        <KeypadButton onClick={() => onDigit("0")}>0</KeypadButton>
        <KeypadButton aria-label="小数点" onClick={onDot}>
          .
        </KeypadButton>
        <KeypadButton
          variant="primary"
          disabled={disabled}
          onClick={onSave}
          className="text-base font-medium"
        >
          {saving ? <Loader2 className="size-5 animate-spin" /> : "保存"}
        </KeypadButton>
      </div>
    </div>
  );
}

function KeypadButton({
  variant = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { variant?: "default" | "muted" | "primary" }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-12 items-center justify-center rounded-xl font-mono text-xl tabular-nums transition-colors select-none",
        "disabled:opacity-50",
        variant === "default" && "bg-muted/60 active:bg-muted hover:bg-muted",
        variant === "muted" && "bg-transparent text-muted-foreground hover:bg-muted/60",
        variant === "primary" && "bg-blue-500 font-medium text-white hover:bg-blue-600",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
