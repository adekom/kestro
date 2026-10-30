"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="link text-sm"
      onClick={async () => {
        await fetch("/api/session", { method: "DELETE" });
        router.replace("/login");
      }}
    >
      Sign out
    </button>
  );
}
