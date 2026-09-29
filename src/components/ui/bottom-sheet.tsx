"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

/**
 * 底部抽屉。
 *
 * 与居中 Dialog 共用 Radix Dialog 原语（焦点陷阱、Esc 关闭、滚动锁一并复用），
 * 只是把内容贴到底部并改成上滑动画。设计稿里的「选择日期」「选择账户」都用它。
 */
function BottomSheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="bottom-sheet" {...props} />;
}

function BottomSheetTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="bottom-sheet-trigger" {...props} />;
}

function BottomSheetClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="bottom-sheet-close" {...props} />;
}

function BottomSheetContent({
  className,
  title,
  children,
  footer,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  /** 固定在抽屉底部、不随内容滚动的操作区 */
  footer?: React.ReactNode;
  showCloseButton?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="bottom-sheet-overlay"
        className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Content
        data-slot="bottom-sheet-content"
        aria-describedby={undefined}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-popover text-popover-foreground ring-1 ring-foreground/10 outline-none",
          "duration-200 data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom",
          className,
        )}
        {...props}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="h-1 w-9 rounded-full bg-muted-foreground/30" aria-hidden />
        </div>

        <div className="flex items-center gap-2 px-4 pb-2">
          <DialogPrimitive.Title className="font-heading text-base font-medium">
            {title}
          </DialogPrimitive.Title>
          {showCloseButton ? (
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" className="ml-auto">
                <XIcon />
                <span className="sr-only">关闭</span>
              </Button>
            </DialogPrimitive.Close>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>

        {footer ? (
          <div className="border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : (
          <div className="pb-[env(safe-area-inset-bottom)]" />
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { BottomSheet, BottomSheetClose, BottomSheetContent, BottomSheetTrigger };
