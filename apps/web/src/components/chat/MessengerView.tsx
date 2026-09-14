"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post } from "@/lib/api";
import { Avatar } from "@/components/profile/Avatar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { useChatChannel } from "@/lib/use-chat-socket";
import styles from "./MessengerView.module.css";

type Tab = "CHATS" | "MEMBERS" | "FRIENDS" | "GLOBAL";

interface Member {
  id: string;
  handle: string;
  avatarKey: string | null;
  selectedBadgeCode: string | null;
  bio: string | null;
  friendStatus: string | null;
  isFriend: boolean;
  isPending: boolean;
}

interface Conversation {
  partnerId: string;
  partnerHandle: string;
  partnerAvatar: string | null;
  selectedBadgeCode: string | null;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    isMine: boolean;
    createdAt: string;
  };
  unreadCount: number;
}

interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isMine: boolean;
  readAt: string | null;
  createdAt: string;
}

export function MessengerView({ initialPartnerId }: { initialPartnerId?: string | undefined }) {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("CHATS");
  const [searchQuery, setSearchQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const [activePartner, setActivePartner] = useState<{ id: string; handle: string; avatar: string | null } | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const globalState = useChatChannel({ channel: "GLOBAL" });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      setLoadingChats(true);
      const res = await get<{ conversations: Conversation[] }>("/v1/chat/direct/conversations");
      setConversations(res.conversations || []);
    } catch {
      // ignore
    } finally {
      setLoadingChats(false);
    }
  }, []);

  // Load friends
  const loadFriends = useCallback(async () => {
    try {
      const res = await get<{ friends: Member[] }>("/v1/friends");
      setFriends(res.friends || []);
    } catch {
      // ignore
    }
  }, []);

  // Search or list members
  const searchMembers = useCallback(async (query: string) => {
    try {
      setLoadingMembers(true);
      const res = await get<{ members: Member[] }>(
        query ? `/v1/members?q=${encodeURIComponent(query)}` : "/v1/members?limit=30"
      );
      setMembers(res.members || []);
    } catch {
      // ignore
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  // Load active partner messages
  const loadMessages = useCallback(async (partnerId: string) => {
    try {
      const res = await get<{ messages: DirectMessage[] }>(`/v1/chat/direct/${partnerId}/messages?limit=60`);
      setMessages(res.messages || []);
    } catch {
      // ignore
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadConversations();
    loadFriends();
    searchMembers("");
  }, [loadConversations, loadFriends, searchMembers]);

  // Handle search query with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      searchMembers(searchQuery);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, searchMembers]);

  // Handle initial partner
  useEffect(() => {
    if (initialPartnerId) {
      void get<{ members: Member[] }>(`/v1/members?q=${encodeURIComponent(initialPartnerId)}`).then((r) => {
        const found = r.members?.[0];
        if (found) {
          setActivePartner({ id: found.id, handle: found.handle, avatar: found.avatarKey ?? null });
        } else {
          setActivePartner({ id: initialPartnerId, handle: initialPartnerId, avatar: null });
        }
      }).catch(() => {});
    }
  }, [initialPartnerId]);

  // Polling for active DM messages
  useEffect(() => {
    if (!activePartner) return;
    loadMessages(activePartner.id);

    const interval = setInterval(() => {
      loadMessages(activePartner.id);
    }, 2500);

    return () => clearInterval(interval);
  }, [activePartner, loadMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send DM
  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!activePartner || !draft.trim() || sending) return;

    const text = draft.trim();
    setSending(true);
    setDraft("");

    // Optimistic message
    const tempMsg: DirectMessage = {
      id: `temp_${Date.now()}`,
      senderId: player?.id ?? "",
      receiverId: activePartner.id,
      content: text,
      isMine: true,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      await post(`/v1/chat/direct/${activePartner.id}/messages`, { content: text });
      loadMessages(activePartner.id);
      loadConversations();
    } catch {
      // rollback or retry
    } finally {
      setSending(false);
    }
  }

  // Add friend
  async function handleAddFriend(member: Member) {
    try {
      await post("/v1/friends/request", { target: member.handle });
      loadFriends();
      searchMembers(searchQuery);
    } catch {
      // ignore
    }
  }

  // Remove friend
  async function handleRemoveFriend(friendId: string) {
    try {
      await post("/v1/friends/remove", { friendId });
      loadFriends();
      searchMembers(searchQuery);
    } catch {
      // ignore
    }
  }

  // Challenge player
  function handleChallenge(handle: string) {
    router.push(`/${locale}/play/chess?mode=friend&opponent=${encodeURIComponent(handle)}`);
  }

  const isMobileDetailOpen = activePartner !== null;

  return (
    <div className={styles.messengerShell}>
      {/* Sidebar: Lists & Search */}
      <aside className={`${styles.sidebar} ${isMobileDetailOpen ? styles.sidebarHiddenMobile : ""}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.titleRow}>
            <h1 className={styles.sidebarTitle}>
              <span className={styles.titleIcon}>💬</span>
              <span>{locale === "ar" ? "ماسنجر نيزالو" : "Nizalo Messenger"}</span>
            </h1>
          </div>

          {/* Search bar */}
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value && activeTab !== "MEMBERS") {
                  setActiveTab("MEMBERS");
                }
              }}
              placeholder={locale === "ar" ? "ابحث بالاسم أو الإيميل..." : "Search nickname or email..."}
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className={styles.tabsRow}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "CHATS" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("CHATS")}
            >
              💬 {locale === "ar" ? "المحادثات" : "Chats"}
              {conversations.some((c) => c.unreadCount > 0) && <span className={styles.unreadDot} />}
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "MEMBERS" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("MEMBERS")}
            >
              👥 {locale === "ar" ? "الأعضاء" : "Members"}
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "FRIENDS" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("FRIENDS")}
            >
              🤝 {locale === "ar" ? "الأصدقاء" : "Friends"}
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "GLOBAL" ? styles.tabActive : ""}`}
              onClick={() => {
                setActiveTab("GLOBAL");
                setActivePartner(null);
              }}
            >
              🌐 {locale === "ar" ? "العام" : "Global"}
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className={styles.listContainer}>
          {/* TAB: CHATS */}
          {activeTab === "CHATS" && (
            <div className={styles.conversationsList}>
              {loadingChats ? (
                <div className={styles.emptyState}>
                  <p>{locale === "ar" ? "جاري تحميل المحادثات..." : "Loading chats..."}</p>
                </div>
              ) : conversations.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>💬</div>
                  <p>{locale === "ar" ? "لا توجد محادثات نشطة بعد" : "No active conversations yet"}</p>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={() => setActiveTab("MEMBERS")}
                  >
                    {locale === "ar" ? "تصفح قائمة الأعضاء لبدء محادثة" : "Browse members to start chat"}
                  </button>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.partnerId}
                    className={`${styles.convItem} ${activePartner?.id === conv.partnerId ? styles.convItemActive : ""}`}
                    onClick={() => {
                      setActivePartner({ id: conv.partnerId, handle: conv.partnerHandle, avatar: conv.partnerAvatar });
                    }}
                  >
                    <div className={styles.avatarWrap}>
                      <Avatar nickname={conv.partnerHandle} avatarUrl={conv.partnerAvatar} size={44} />
                      <span className={styles.onlineBadge} />
                    </div>
                    <div className={styles.convDetails}>
                      <div className={styles.convTop}>
                        <span className={styles.convHandle}>{conv.partnerHandle}</span>
                        <span className={styles.convTime}>
                          {new Date(conv.lastMessage.createdAt).toLocaleTimeString(locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className={styles.convBottom}>
                        <p className={styles.convSnippet}>
                          {conv.lastMessage.isMine && (locale === "ar" ? "أنت: " : "You: ")}
                          {conv.lastMessage.content}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className={styles.unreadBadge}>{conv.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: MEMBERS */}
          {activeTab === "MEMBERS" && (
            <div className={styles.membersList}>
              {loadingMembers ? (
                <div className={styles.emptyState}>
                  <p>{locale === "ar" ? "جاري البحث في قائمة الأعضاء..." : "Searching members..."}</p>
                </div>
              ) : members.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🔍</div>
                  <p>{locale === "ar" ? "لم يتم العثور على أعضاء يطابقون هذا البحث" : "No matching members found"}</p>
                </div>
              ) : (
                members.map((m) => (
                  <div key={m.id} className={styles.memberCard}>
                    <div className={styles.memberInfo}>
                      <div className={styles.avatarWrap}>
                        <Avatar nickname={m.handle} avatarUrl={m.avatarKey} size={42} />
                        <span className={styles.onlineBadge} />
                      </div>
                      <div className={styles.memberMeta}>
                        <span className={styles.memberName}>{m.handle}</span>
                        {m.bio && <span className={styles.memberBio}>{m.bio}</span>}
                        {m.isFriend && (
                          <span className={styles.friendTag}>✓ {locale === "ar" ? "صديق" : "Friend"}</span>
                        )}
                      </div>
                    </div>

                    <div className={styles.memberActions}>
                      <button
                        type="button"
                        className={styles.msgBtn}
                        title={locale === "ar" ? "مراسلة فورية" : "Send message"}
                        onClick={() => {
                          setActivePartner({ id: m.id, handle: m.handle, avatar: m.avatarKey });
                        }}
                      >
                        💬
                      </button>
                      <button
                        type="button"
                        className={styles.duelBtn}
                        title={locale === "ar" ? "تحدي مبارزة" : "Challenge duel"}
                        onClick={() => handleChallenge(m.handle)}
                      >
                        ⚔️
                      </button>
                      {!m.isFriend && (
                        <button
                          type="button"
                          className={styles.addFriendBtn}
                          title={locale === "ar" ? "إضافة صديق" : "Add friend"}
                          onClick={() => handleAddFriend(m)}
                        >
                          ➕
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: FRIENDS */}
          {activeTab === "FRIENDS" && (
            <div className={styles.membersList}>
              {friends.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🤝</div>
                  <p>{locale === "ar" ? "ليس لديك أصدقاء مضافون بعد" : "No friends added yet"}</p>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={() => setActiveTab("MEMBERS")}
                  >
                    {locale === "ar" ? "ابحث عن أعضاء وأضف أصدقاء" : "Find and add members"}
                  </button>
                </div>
              ) : (
                friends.map((f) => (
                  <div key={f.id} className={styles.memberCard}>
                    <div className={styles.memberInfo}>
                      <div className={styles.avatarWrap}>
                        <Avatar nickname={f.handle} avatarUrl={f.avatarKey} size={42} />
                        <span className={styles.onlineBadge} />
                      </div>
                      <div className={styles.memberMeta}>
                        <span className={styles.memberName}>{f.handle}</span>
                        <span className={styles.friendTag}>✓ {locale === "ar" ? "صديق" : "Friend"}</span>
                      </div>
                    </div>

                    <div className={styles.memberActions}>
                      <button
                        type="button"
                        className={styles.msgBtn}
                        title={locale === "ar" ? "مراسلة" : "Chat"}
                        onClick={() => {
                          setActivePartner({ id: f.id, handle: f.handle, avatar: f.avatarKey });
                        }}
                      >
                        💬
                      </button>
                      <button
                        type="button"
                        className={styles.duelBtn}
                        title={locale === "ar" ? "تحدي" : "Challenge"}
                        onClick={() => handleChallenge(f.handle)}
                      >
                        ⚔️
                      </button>
                      <button
                        type="button"
                        className={styles.removeFriendBtn}
                        title={locale === "ar" ? "إزالة الصداقة" : "Remove friend"}
                        onClick={() => handleRemoveFriend(f.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className={`${styles.chatArea} ${!isMobileDetailOpen && activeTab !== "GLOBAL" ? styles.chatAreaHiddenMobile : ""}`}>
        {activeTab === "GLOBAL" ? (
          <div className={styles.globalChatWrapper}>
            <ChatWindow channelKind="GLOBAL" state={globalState} />
          </div>
        ) : activePartner ? (
          <div className={styles.activeDmContainer}>
            {/* DM Top Bar */}
            <div className={styles.dmHeader}>
              <div className={styles.dmHeaderLeft}>
                <button
                  type="button"
                  className={styles.mobileBackBtn}
                  onClick={() => setActivePartner(null)}
                >
                  ← {locale === "ar" ? "الرجوع" : "Back"}
                </button>
                <Avatar nickname={activePartner.handle} avatarUrl={activePartner.avatar} size={40} />
                <div className={styles.partnerDetails}>
                  <h2 className={styles.partnerName}>{activePartner.handle}</h2>
                  <span className={styles.partnerStatus}>
                    <span className={styles.statusDot} /> {locale === "ar" ? "متصل الآن" : "Online now"}
                  </span>
                </div>
              </div>

              <div className={styles.dmHeaderRight}>
                <button
                  type="button"
                  className={styles.headerChallengeBtn}
                  onClick={() => handleChallenge(activePartner.handle)}
                >
                  ⚔️ {locale === "ar" ? "تحدي مبارزة" : "Challenge"}
                </button>
                <button
                  type="button"
                  className={styles.headerProfileBtn}
                  onClick={() => router.push(`/${locale}/players/${encodeURIComponent(activePartner.handle)}`)}
                >
                  👤 {locale === "ar" ? "الملف" : "Profile"}
                </button>
              </div>
            </div>

            {/* Messages Thread */}
            <div className={styles.dmThread}>
              {messages.length === 0 ? (
                <div className={styles.dmEmpty}>
                  <div className={styles.emptyIcon}>👋</div>
                  <h3>{locale === "ar" ? `ابدأ المحادثة مع ${activePartner.handle}` : `Start chatting with ${activePartner.handle}`}</h3>
                  <p>{locale === "ar" ? "قل مرحباً، أو اتفقا على رهان ومبارزة الآن!" : "Say hello or agree on a match stake!"}</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${styles.messageRow} ${msg.isMine ? styles.msgMine : styles.msgOther}`}
                  >
                    {!msg.isMine && (
                      <Avatar nickname={activePartner.handle} avatarUrl={activePartner.avatar} size={32} />
                    )}
                    <div className={styles.bubbleWrap}>
                      <div className={styles.messageBubble}>
                        <p className={styles.bubbleText}>{msg.content}</p>
                      </div>
                      <span className={styles.messageTime}>
                        {new Date(msg.createdAt).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {msg.isMine && <span className={styles.readCheck}> ✓</span>}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick emoji reaction bar */}
            <div className={styles.quickEmojisRow}>
              {["👍", "🔥", "⚔️", "🏆", "😄", "🤝", "🎲", "👑"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={styles.quickEmojiBtn}
                  onClick={() => setDraft((prev) => prev + emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Message Input Form */}
            <form className={styles.dmInputForm} onSubmit={handleSendMessage}>
              <input
                type="text"
                className={styles.dmInput}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={locale === "ar" ? "اكتب رسالتك هنا..." : "Type your message here..."}
                maxLength={2000}
                autoFocus
              />
              <button
                type="submit"
                className={styles.dmSendBtn}
                disabled={!draft.trim() || sending}
              >
                <span>{locale === "ar" ? "إرسال" : "Send"}</span>
                <span className={styles.sendArrow}>{locale === "ar" ? "←" : "→"}</span>
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.noActiveDm}>
            <div className={styles.welcomeBanner}>
              <div className={styles.welcomeGraphic}>💬</div>
              <h2>{locale === "ar" ? "مرحباً بك في ماسنجر نيزالو" : "Welcome to Nizalo Messenger"}</h2>
              <p>
                {locale === "ar"
                  ? "تواصل مع أعضاء المنصة، أضف أصدقاءك، ونسّق معهم التحديات والمبارزات بسهولة تامة."
                  : "Connect with platform members, add friends, and arrange duel challenges effortlessly."}
              </p>
              <button
                type="button"
                className={styles.primaryActionBtn}
                onClick={() => setActiveTab("MEMBERS")}
              >
                {locale === "ar" ? "استعراض جميع الأعضاء 👥" : "Explore all members 👥"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
