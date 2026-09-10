"use client";

import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChatChannel } from "@/lib/use-chat-socket";
import styles from "./chat.module.css";

export default function ChatPage() {
  const state = useChatChannel({ channel: "GLOBAL" });
  return (
    <RequireAuth>
      <Header />
      <div className={styles.wrap}>
        <ChatWindow channelKind="GLOBAL" state={state} />
      </div>
    </RequireAuth>
  );
}
