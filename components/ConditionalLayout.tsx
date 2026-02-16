"use client";

import { useAuth } from "@clerk/nextjs";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

function Header() {
  return (
    <header className="border-b bg-white dark:bg-zinc-950">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <img src="/logo.jpg" alt="Spend" className="h-8 w-8 rounded-lg" />
          <span>Spend</span>
        </Link>
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  
  // For unauthenticated users, render children directly (landing page handles its own layout)
  if (isLoaded && !userId) {
    return <>{children}</>;
  }
  
  // For authenticated users, show header + main content
  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </>
  );
}
