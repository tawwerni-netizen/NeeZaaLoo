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
  isSelf?: boolean;
  isOnline?: boolean | undefined;
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
  isOnline?: boolean | undefined;
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

  const [activePartner, setActivePartner] = useState<{ id: string; handle: string; avatar: string | null; isOnline?: boolean | undefined } | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // Admin moderation states
  const [muteTarget, setMuteTarget] = useState<{ id: string; handle: string } | null>(null);
  const [muteDuration, setMuteDuration] = useState<number>(3600000);
  const [muteReason, setMuteReason] = useState("");
  const [banTarget, setBanTarget] = useState<{ id: string; handle: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  function flashNotice(msg: string) {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  }

  async function handleDeleteDirectMessage(msgId: string) {
    if (!confirm(locale === "ar" ? "هل أنت متأكد من حذف هذه الرسالة نهائياً؟" : "Are you sure you want to delete this message?")) return;
    try {
      await post(`/v1/admin/chat/direct-messages/${msgId}/delete`, {});
      flashNotice(locale === "ar" ? "تم حذف الرسالة بنجاح" : "Message deleted");
      if (activePartner) loadMessages(activePartner.id);
      loadConversations();
    } catch {
      alert("Failed to delete direct message");
    }
  }

  async function handleMuteUser() {
    if (!muteTarget) return;
    const reason = muteReason.trim() || "Violation of chat rules";
    try {
      await post("/v1/admin/chat/mutes", {
        targetId: muteTarget.id,
        reason,
        scope: "ALL_CHAT",
        durationMs: muteDuration > 0 ? muteDuration : null,
      });
      flashNotice(locale === "ar" ? `تم كتم @${muteTarget.handle} بنجاح` : `Player @${muteTarget.handle} muted`);
      setMuteTarget(null);
      setMuteReason("");
    } catch {
      alert("Failed to mute player");
    }
  }

  async function handleBanUser() {
    if (!banTarget) return;
    const reason = banReason.trim() || "Banned by administrator";
    try {
      await post(`/v1/admin/players/${banTarget.id}/ban`, { reason });
      flashNotice(locale === "ar" ? `تم حظر @${banTarget.handle} من الموقع بالكامل` : `Player @${banTarget.handle} banned from platform`);
      setBanTarget(null);
      setBanReason("");
    } catch {
      alert("Failed to ban player. Super Admins cannot be banned.");
    }
  }

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
                      setActivePartner({ id: conv.partnerId, handle: conv.partnerHandle, avatar: conv.partnerAvatar, isOnline: conv.isOnline });
                    }}
                  >
                    <div className={styles.avatarWrap}>
                      <Avatar nickname={conv.partnerHandle} avatarUrl={conv.partnerAvatar} size={44} />
                      <span
                        className={conv.isOnline ? styles.onlineBadge : styles.offlineBadge}
                        title={conv.isOnline ? (locale === "ar" ? "متصل الآن" : "Online") : (locale === "ar" ? "غير متصل" : "Offline")}
                      />
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
                        <span
                          className={m.isOnline ? styles.onlineBadge : styles.offlineBadge}
                          title={m.isOnline ? (locale === "ar" ? "متصل الآن" : "Online") : (locale === "ar" ? "غير متصل" : "Offline")}
                        />
                      </div>
                      <div className={styles.memberMeta}>
                        <span className={styles.memberName}>{m.handle}</span>
                        {m.isSelf && (
                          <span className={styles.selfTag}>⭐ {locale === "ar" ? "أنت (حسابك الشخصي)" : "You (Your Account)"}</span>
                        )}
                        {m.bio && <span className={styles.memberBio}>{m.bio}</span>}
                        {m.isFriend && (
                          <span className={styles.friendTag}>✓ {locale === "ar" ? "صديق" : "Friend"}</span>
                        )}
                      </div>
                    </div>

                    <div className={styles.memberActions}>
                      {!m.isSelf ? (
                        <>
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
                          {player?.isAdmin && (
                            <>
                              <button
                                type="button"
                                className={styles.muteBtn}
                                title={locale === "ar" ? "كتم من الشات (مشرف)" : "Mute from Chat (Mod)"}
                                onClick={() => {
                                  setMuteTarget({ id: m.id, handle: m.handle });
                                  setMuteReason("");
                                }}
                              >
                                🔇
                              </button>
                              <button
                                type="button"
                                className={styles.banBtn}
                                title={locale === "ar" ? "حظر من الموقع نهائياً (مشرف)" : "Ban from Platform (Mod)"}
                                onClick={() => {
                                  setBanTarget({ id: m.id, handle: m.handle });
                                  setBanReason("");
                                }}
                              >
                                🚫
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <span className={styles.selfIndicator}>👑 {locale === "ar" ? "نشط الآن" : "Online"}</span>
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
                        <span
                          className={f.isOnline ? styles.onlineBadge : styles.offlineBadge}
                          title={f.isOnline ? (locale === "ar" ? "متصل الآن" : "Online") : (locale === "ar" ? "غير متصل" : "Offline")}
                        />
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
                          setActivePartner({ id: f.id, handle: f.handle, avatar: f.avatarKey, isOnline: f.isOnline });
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
                    <span className={activePartner.isOnline ? styles.statusDot : styles.statusDotOffline} />{" "}
                    {activePartner.isOnline
                      ? (locale === "ar" ? "متصل الآن" : "Online now")
                      : (locale === "ar" ? "غير متصل" : "Offline")}
                  </span>
                </div>
              </div>

              <div className={styles.dmHeaderRight}>
                {player?.isAdmin && (
                  <>
                    <button
                      type="button"
                      className={styles.headerMuteBtn}
                      onClick={() => {
                        setMuteTarget({ id: activePartner.id, handle: activePartner.handle });
                        setMuteReason("");
                      }}
                      title={locale === "ar" ? "كتم هذا اللاعب من الشات (مشرف)" : "Mute player from chat (Mod)"}
                    >
                      🔇 {locale === "ar" ? "كتم" : "Mute"}
                    </button>
                    <button
                      type="button"
                      className={styles.headerBanBtn}
                      onClick={() => {
                        setBanTarget({ id: activePartner.id, handle: activePartner.handle });
                        setBanReason("");
                      }}
                      title={locale === "ar" ? "حظر هذا اللاعب من الموقع نهائياً (مشرف)" : "Ban player from site (Mod)"}
                    >
                      🚫 {locale === "ar" ? "حظر الموقع" : "Ban Site"}
                    </button>
                  </>
                )}
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
                        <p className={styles.bubbleText}>
                          {msg.content === null ? (
                            <em style={{ color: "#ef4444" }}>
                              {locale === "ar" ? "[تم حذف هذه الرسالة بواسطة المشرف]" : "[Message removed by moderator]"}
                            </em>
                          ) : (
                            msg.content
                          )}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: msg.isMine ? "flex-end" : "flex-start", gap: "6px" }}>
                        <span className={styles.messageTime}>
                          {new Date(msg.createdAt).toLocaleTimeString(locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {msg.isMine && <span className={styles.readCheck}> ✓</span>}
                        </span>
                        {player?.isAdmin && msg.content !== null && (
                          <div className={styles.msgModRow}>
                            <button
                              type="button"
                              className={`${styles.msgModLink} ${styles.msgModLinkDanger}`}
                              onClick={() => handleDeleteDirectMessage(msg.id)}
                              title={locale === "ar" ? "حذف الرسالة (مشرف)" : "Delete Message (Mod)"}
                            >
                              🗑️
                            </button>
                            <button
                              type="button"
                              className={styles.msgModLink}
                              onClick={() => {
                                const targetId = msg.isMine ? (player?.id ?? "") : activePartner.id;
                                const targetHandle = msg.isMine ? (player?.handle ?? "") : activePartner.handle;
                                setMuteTarget({ id: targetId, handle: targetHandle });
                                setMuteReason("");
                              }}
                              title={locale === "ar" ? "كتم اللاعب (مشرف)" : "Mute Player (Mod)"}
                            >
                              🔇
                            </button>
                            <button
                              type="button"
                              className={`${styles.msgModLink} ${styles.msgModLinkDanger}`}
                              onClick={() => {
                                const targetId = msg.isMine ? (player?.id ?? "") : activePartner.id;
                                const targetHandle = msg.isMine ? (player?.handle ?? "") : activePartner.handle;
                                setBanTarget({ id: targetId, handle: targetHandle });
                                setBanReason("");
                              }}
                              title={locale === "ar" ? "حظر اللاعب من الموقع (مشرف)" : "Ban Player from Site (Mod)"}
                            >
                              🚫
                            </button>
                          </div>
                        )}
                      </div>
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

      {/* Action Notice Toast */}
      {actionNotice && (
        <div style={{
          position: "fixed",
          bottom: "24px",
          right: locale === "ar" ? "auto" : "24px",
          left: locale === "ar" ? "24px" : "auto",
          background: "rgba(34, 197, 94, 0.95)",
          color: "#fff",
          padding: "12px 20px",
          borderRadius: "8px",
          fontWeight: 700,
          fontSize: "14px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          zIndex: 10001,
        }}>
          ✓ {actionNotice}
        </div>
      )}

      {/* Admin Mute Modal */}
      {muteTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, padding: "16px",
        }}>
          <div style={{
            background: "#161922", border: "1px solid #f59e0b", borderRadius: "12px",
            maxWidth: "440px", width: "100%", padding: "22px", color: "#fff",
          }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "17px", color: "#f59e0b" }}>
              🔇 {locale === "ar" ? `كتم @${muteTarget.handle} من الشات` : `Mute @${muteTarget.handle} from Chat`}
            </h3>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 14px 0", lineHeight: 1.5 }}>
              {locale === "ar"
                ? "لن يتمكن اللاعب من إرسال أي رسائل في جميع قنوات الشات حتى انتهاء المدة أو إلغاء الكتم."
                : "The player will not be able to send messages across any chat channel until the mute expires."}
            </p>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                {locale === "ar" ? "مدة الكتم:" : "Duration:"}
              </label>
              <select
                value={muteDuration}
                onChange={(e) => setMuteDuration(Number(e.target.value))}
                style={{
                  width: "100%", padding: "10px 12px", background: "#0e1015",
                  border: "1px solid #252b37", borderRadius: "6px", color: "#fff", fontSize: "13px",
                }}
              >
                <option value={3600000}>{locale === "ar" ? "ساعة واحدة" : "1 Hour"}</option>
                <option value={86400000}>{locale === "ar" ? "24 ساعة (يوم)" : "24 Hours (1 Day)"}</option>
                <option value={604800000}>{locale === "ar" ? "7 أيام" : "7 Days"}</option>
                <option value={0}>{locale === "ar" ? "دائم" : "Permanent"}</option>
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                {locale === "ar" ? "سبب الكتم:" : "Reason:"}
              </label>
              <input
                type="text"
                placeholder={locale === "ar" ? "ألفاظ مسيئة، إزعاج، سبام..." : "Offensive language, spam, harassment..."}
                value={muteReason}
                onChange={(e) => setMuteReason(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", background: "#0e1015",
                  border: "1px solid #252b37", borderRadius: "6px", color: "#fff", fontSize: "13px",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.msgBtn}
                onClick={() => setMuteTarget(null)}
              >
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleMuteUser}
                style={{
                  background: "#f59e0b", border: "none", color: "#000", fontWeight: 700,
                  padding: "8px 16px", borderRadius: "6px", cursor: "pointer",
                }}
              >
                {locale === "ar" ? "تأكيد الكتم" : "Confirm Mute"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Ban Modal */}
      {banTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, padding: "16px",
        }}>
          <div style={{
            background: "#161922", border: "1px solid #ef4444", borderRadius: "12px",
            maxWidth: "440px", width: "100%", padding: "22px", color: "#fff",
          }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#ef4444", fontSize: "17px" }}>
              🚫 {locale === "ar" ? `حظر @${banTarget.handle} من الموقع كلياً` : `Ban @${banTarget.handle} from Platform`}
            </h3>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 14px 0", lineHeight: 1.5 }}>
              {locale === "ar"
                ? "سيتم إنهاء كافة جلسات اللاعب فوراً ومنعه من تسجيل الدخول واستخدام المنصة نهائياً."
                : "All active sessions will be terminated immediately and account disabled."}
            </p>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                {locale === "ar" ? "سبب الحظر:" : "Reason:"}
              </label>
              <input
                type="text"
                placeholder={locale === "ar" ? "مخالفة الشروط، سلوك عدائي..." : "Terms violation, abusive behavior..."}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", background: "#0e1015",
                  border: "1px solid #252b37", borderRadius: "6px", color: "#fff", fontSize: "13px",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.msgBtn}
                onClick={() => setBanTarget(null)}
              >
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleBanUser}
                style={{
                  background: "#ef4444", border: "none", color: "#fff", fontWeight: 700,
                  padding: "8px 16px", borderRadius: "6px", cursor: "pointer",
                }}
              >
                {locale === "ar" ? "تأكيد الحظر" : "Confirm Ban"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
