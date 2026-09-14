"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { MessengerView } from "@/components/chat/MessengerView";
import styles from "./chat.module.css";

function ChatContent() {
  const searchParams = useSearchParams();
  const partnerId = searchParams?.get("partner") || searchParams?.get("user");

  return (
    <div className={styles.wrap}>
      {partnerId ? (
        <MessengerView initialPartnerId={partnerId} />
      ) : (
        <MessengerView />
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <RequireAuth>
      <Header />
      <Suspense fallback={<div className={styles.wrap} />}>
        <ChatContent />
      </Suspense>
    </RequireAuth>
  );
}

