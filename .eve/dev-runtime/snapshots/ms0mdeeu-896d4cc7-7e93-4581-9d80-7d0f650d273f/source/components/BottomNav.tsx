"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/trends", label: "Trends", icon: "insights" },
  { href: "/check-in", label: "Check-in", icon: "edit_note" },
  { href: "/coaching", label: "Coaching", icon: "support_agent" },
  { href: "/evidence", label: "Evidence", icon: "menu_book" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 z-50 w-full rounded-t-xl bg-surface-container/90 px-4 py-3 pb-safe shadow-lg backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-around">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                active
                  ? "flex flex-col items-center justify-center rounded-full bg-primary-container px-4 py-1 text-on-primary-container transition-transform active:scale-90"
                  : "flex flex-col items-center justify-center text-on-surface-variant transition-colors transition-transform hover:text-primary active:scale-90"
              }
            >
              <span className="material-symbols-outlined">{tab.icon}</span>
              <span className="text-label-md">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
