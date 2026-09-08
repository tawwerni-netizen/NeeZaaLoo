"use client";

import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { ChatWindow } from "@/components/chat/ChatWindow";
import styles from "./chat.module.css";

export default function ChatPage() {
  return (
    <RequireAuth>
      <Header />
      <div className={styles.wrap}>
        <ChatWindow channel="GLOBAL" />
      </div>
    </RequireAuth>
  );
}
