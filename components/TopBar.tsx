"use client";

import { supabaseBrowser } from "@/lib/supabase";

interface TopBarProps {
  title: string;
  onBack?: string;
  icon?: string;
}

async function switchDemoUser() {
  await supabaseBrowser().auth.signOut();
  // Full reload so AnonAuthProvider re-mounts and re-checks the (now cleared) session.
  window.location.href = "/";
}

export function TopBar({ title, onBack, icon = "notifications" }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 z-50 w-full bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-container-margin py-4">
        <div className="flex items-center gap-3">
          {onBack ? (
            <a href={onBack} className="text-primary transition-transform active:scale-95" aria-label="Back">
              <span className="material-symbols-outlined">arrow_back</span>
            </a>
          ) : null}
          <h1 className="text-headline-md font-semibold text-primary">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void switchDemoUser()}
            className="text-on-surface-variant transition-transform active:scale-95"
            aria-label="Switch demo user"
            title="Switch demo user"
          >
            <span className="material-symbols-outlined">swap_horiz</span>
          </button>
          <span className="text-on-surface-variant" aria-hidden="true">
            <span className="material-symbols-outlined">{icon}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
