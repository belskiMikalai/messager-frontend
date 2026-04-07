import { useState, useEffect, useRef, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { messagesApi, usersApi } from "./services/api";
import { wsService, WsMessageType } from "./services/ws";
import { webRTCService } from "./services/webrtc";
import { audioStreamingService } from "./services/audioStream";
import { VideoCallModal, IncomingCallModal } from "./components/VideoCallModal";
import type { Chat, Message, User } from "./types";
import type { Participant } from "./components/ParticipantGrid";
import "./App.css";

function AppContent() {
  const { isLoggedIn, login, register, logout, chats, refreshChats, userId } =
    useAuth();
  const [view, setView] = useState<"login" | "register" | "chats">("login");
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await login(fd.get("login") as string, fd.get("password") as string);
      setView("chats");
    } catch {
      setError("Login failed");
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await register(
        fd.get("name") as string,
        fd.get("email") as string,
        fd.get("password") as string,
      );
      setView("chats");
    } catch {
      setError("Register failed");
    }
  };

  const openChat = async (chat: Chat) => {
    setActiveChat(chat);
    const res = await messagesApi.getByChat(chat.id);
    if (res.success && res.data) setMessages(res.data);

    try {
      await wsService.connect();
      wsService.subscribe(chat.name);
      wsService.onMessage((msg) => {
        if (
          msg.payload.senderId === userId &&
          msg.type !== WsMessageType.CALL_ACCEPTED &&
          msg.type !== WsMessageType.CALL_REJECTED
        )
          return;

        const isTargetedMessage = msg.payload.targetId === userId;
        const isAllowedTargeted =
          msg.type === WsMessageType.CALL_ACCEPTED ||
          msg.type === WsMessageType.CALL_REJECTED;

        if (isTargetedMessage && !isAllowedTargeted) return;

        const isChatMessage =
          msg.type === WsMessageType.MESSAGE_CREATED ||
          msg.type === WsMessageType.CALL_INITIATED;

        if (isChatMessage && msg.payload.chatId !== chat.id) return;

        if (msg.type === WsMessageType.MESSAGE_CREATED) {
          const msgId = msg.payload.messageId
            ? msg.payload.messageId
            : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          setMessages((prev) => {
            const existsById = prev.some(
              (m) => msg.payload.messageId && m.id === msg.payload.messageId,
            );
            const isDuplicate =
              existsById ||
              prev.some(
                (m) =>
                  m.content === msg.payload.content &&
                  Math.abs(new Date(m.createdAt).getTime() - Date.now()) < 2000,
              );
            if (isDuplicate) return prev;
            return [
              ...prev,
              {
                id: msgId,
                content: msg.payload.content || "",
                chatId: chat.id,
                senderId: msg.payload.senderId || 0,
                createdAt: new Date().toISOString(),
              },
            ];
          });
        }
      });
    } catch {
      setError("WebSocket connection failed");
    }
  };

  const handleChatCreated = () => {
    setShowCreateModal(false);
    refreshChats();
  };

  if (!isLoggedIn) {
    return (
      <div className="auth-container">
        <h1>{view === "login" ? "Login" : "Register"}</h1>
        {error && <p className="error">{error}</p>}
        {view === "login" ? (
          <form onSubmit={handleLogin}>
            <input name="login" placeholder="Login" required />
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
            />
            <button type="submit">Login</button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <input name="name" placeholder="Name" required />
            <input name="email" type="email" placeholder="Email" required />
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
            />
            <button type="submit">Register</button>
          </form>
        )}
        <p className="switch">
          {view === "login" ? (
            <button
              onClick={() => {
                setView("register");
                setError("");
              }}
            >
              Need account?
            </button>
          ) : (
            <button
              onClick={() => {
                setView("login");
                setError("");
              }}
            >
              Have account?
            </button>
          )}
        </p>
      </div>
    );
  }

  if (activeChat) {
    return (
      <ChatView
        chat={activeChat}
        messages={messages}
        userId={userId}
        onSend={(content) => wsService.sendMessage(content, activeChat.id)}
        onBack={() => {
          setActiveChat(null);
          wsService.disconnect();
        }}
      />
    );
  }

  return (
    <div className="chats-container">
      <header>
        <h1>Chats</h1>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)}>+ New Chat</button>
          <button className="logout" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <div className="chat-list">
        {chats.map((c) => (
          <div key={c.id} className="chat-item" onClick={() => openChat(c)}>
            <span className="chat-name">{c.name}</span>
          </div>
        ))}
        {chats.length === 0 && <p className="empty">No chats yet</p>}
      </div>
      {showCreateModal && (
        <CreateChatModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleChatCreated}
        />
      )}
    </div>
  );
}

function CreateChatModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (search.trim()) {
      const timer = setTimeout(async () => {
        setLoading(true);
        const res = await usersApi.search(search);
        if (res.success && res.data) setUsers(res.data);
        setLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
    setUsers([]);
  }, [search]);

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) =>
      prev.find((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const createChat = async () => {
    if (!name.trim()) {
      setError("Chat name is required");
      return;
    }
    setCreating(true);
    setError("");

    const BASE = import.meta.env.VITE_BACKEND_URL ?? "localhost:9001";
    try {
      const res = await fetch(`${BASE}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          users: selectedUsers.map((u) => u.id),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated();
      } else {
        setError(data.error || "Failed to create chat");
      }
    } catch {
      setError("Failed to create chat");
    }
    setCreating(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Chat</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <input
            type="text"
            placeholder="Chat name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {selectedUsers.length > 0 && (
            <div className="selected-users">
              {selectedUsers.map((u) => (
                <span key={u.id} className="chip">
                  {u.name}
                  <button onClick={() => toggleUser(u)}>×</button>
                </span>
              ))}
            </div>
          )}

          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loading && <p className="loading">Searching...</p>}

          {!loading && users.length > 0 && (
            <div className="user-list">
              {users.map((u) => (
                <div
                  key={u.id}
                  className={`user-item ${selectedUsers.find((su) => su.id === u.id) ? "selected" : ""}`}
                  onClick={() => toggleUser(u)}
                >
                  <span className="user-name">{u.name}</span>
                  <span className="user-email">{u.email}</span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="error-message">{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="create" onClick={createChat} disabled={creating}>
            {creating ? "Creating..." : "Create Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatView({
  chat,
  messages,
  userId,
  onSend,
  onBack,
}: {
  chat: Chat;
  messages: Message[];
  userId: number | null;
  onSend: (msg: string) => void;
  onBack: () => void;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const [callStatus, setCallStatus] = useState<
    "idle" | "calling" | "ringing" | "connected"
  >("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{
    callerId: number;
    callerName: string;
    isAudioOnly?: boolean;
  } | null>(null);
  const [isGroupCall, setIsGroupCall] = useState(false);
  const [groupCallParticipants, setGroupCallParticipants] = useState<number[]>(
    [],
  );
  const [activeGroupCall, setActiveGroupCall] = useState<{
    chatId: number;
    participants: number[];
  } | null>(null);

  const [audioMuted, setAudioMuted] = useState(false);
  const [callParticipants, setCallParticipants] = useState<Participant[]>([]);

  const callStatusRef = useRef(callStatus);
  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  const endCall = useCallback(() => {
    webRTCService.endCall();
    audioStreamingService.stopStreaming();
    setCallStatus("idle");
    setLocalStream(null);
    setIsMuted(false);
    setIsGroupCall(false);
    setGroupCallParticipants([]);
    setAudioMuted(false);
    setCallParticipants([]);
    if (activeGroupCall) {
      wsService.sendGroupCallEnded(activeGroupCall.chatId, userId!);
      setActiveGroupCall(null);
    }
  }, [activeGroupCall, userId]);

  useEffect(() => {
    const unsubscribe = wsService.onMessage((msg) => {
      if (
        msg.payload.senderId === userId &&
        msg.type !== WsMessageType.CALL_ACCEPTED &&
        msg.type !== WsMessageType.CALL_REJECTED
      )
        return;

      const isTargetedMessage = msg.payload.targetId === userId;
      const isAllowedTargeted =
        msg.type === WsMessageType.CALL_ACCEPTED ||
        msg.type === WsMessageType.CALL_REJECTED;

      if (isTargetedMessage && !isAllowedTargeted) return;

      const isChatMessage =
        msg.type === WsMessageType.MESSAGE_CREATED ||
        msg.type === WsMessageType.CALL_INITIATED;

      if (isChatMessage && msg.payload.chatId !== chat.id) return;

      switch (msg.type) {
        case WsMessageType.CALL_INITIATED:
          if (msg.payload.chatId === chat.id) {
            setIsGroupCall(false);
            setIncomingCall({
              callerId: msg.payload.senderId || 0,
              callerName: "User",
            });
            setCallStatus("ringing");
          }
          break;

        case WsMessageType.JOIN_GROUP_CALL:
          if (msg.payload.chatId === chat.id) {
            try {
              const data = JSON.parse(msg.payload.content || "{}");
              const newParticipants = data.participants || [];
              const peerId = msg.payload.senderId;

              const totalParticipants = newParticipants.length + 1;
              setIsGroupCall(totalParticipants > 2);
              setGroupCallParticipants([...newParticipants, peerId!]);
              setActiveGroupCall({
                chatId: msg.payload.chatId,
                participants: newParticipants,
              });
              setIncomingCall({ callerId: peerId || 0, callerName: "User" });
              setCallStatus("ringing");

              if (peerId && peerId !== userId) {
                const peerUser = chat.users?.find((u) => u.id === peerId);
                if (peerUser) {
                  setCallParticipants((prev) => {
                    if (!prev.find((p) => p.id === peerId)) {
                      return [
                        ...prev,
                        {
                          id: peerUser.id,
                          name: peerUser.name,
                          isMuted: false,
                        },
                      ];
                    }
                    return prev;
                  });
                }
              }
            } catch (e) {
              console.error("Failed to parse JOIN_GROUP_CALL:", e);
            }
          }
          break;

        case WsMessageType.LEAVE_GROUP_CALL:
          if (msg.payload.chatId === chat.id) {
            const leaverId = msg.payload.senderId;
            setGroupCallParticipants((prev) =>
              prev.filter((id) => id !== leaverId),
            );
            setCallParticipants((prev) =>
              prev.filter((p) => p.id !== leaverId),
            );
          }
          break;

        case WsMessageType.CALL_ACCEPTED:
          if (
            callStatusRef.current === "calling" &&
            msg.payload.targetId === userId
          ) {
            setCallStatus("connected");
            const acceptedBy = msg.payload.senderId;
            const acceptedUser = chat.users?.find((u) => u.id === acceptedBy);
            if (acceptedUser) {
              setCallParticipants((prev) => {
                if (!prev.find((p) => p.id === acceptedBy)) {
                  return [
                    ...prev,
                    {
                      id: acceptedUser.id,
                      name: acceptedUser.name,
                      isMuted: false,
                    },
                  ];
                }
                return prev;
              });
            }
          }
          break;

        case WsMessageType.CALL_REJECTED:
          setCallError(msg.payload.content || "Call was rejected");
          endCall();
          break;

        case WsMessageType.AUDIO_BROADCAST:
          if (
            msg.payload.senderId !== userId &&
            msg.payload.chatId === chat.id
          ) {
            const pcmData = msg.payload.pcmData;
            if (pcmData && typeof pcmData === "string") {
              audioStreamingService.playReceivedAudio(pcmData);
            }
          }
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [chat.id, userId, chat.users, endCall]);

  useEffect(() => {
    return () => {
      webRTCService.endCall();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startCall = async () => {
    if (!userId) return;

    const isGroup = (chat.users?.length || 0) > 2;

    try {
      const stream = await webRTCService.getAudioStream();
      if (!stream) {
        setCallError("Could not access microphone");
        return;
      }

      setLocalStream(stream);
      setCallStatus("calling");

      const selfParticipant: Participant = {
        id: userId,
        name: chat.users?.find((u) => u.id === userId)?.name || "You",
        isMuted: false,
      };
      setCallParticipants([selfParticipant]);

      if (isGroup) {
        const participants =
          chat.users?.filter((u) => u.id !== userId).map((u) => u.id) || [];
        setIsGroupCall(true);
        setGroupCallParticipants(participants);
        setActiveGroupCall({ chatId: chat.id, participants });
        wsService.sendGroupCallStarted(chat.id, userId, participants);
      } else {
        wsService.sendCallInitiated(chat.id, userId);
      }

      onSend("Starting audio call");
    } catch (err) {
      console.error("Failed to start call:", err);
      setCallError("Could not access microphone");
    }
  };

  const acceptCall = async () => {
    if (incomingCall && userId) {
      setIncomingCall(null);
      setCallStatus("calling");

      try {
        const stream = await webRTCService.getAudioStream();
        if (!stream) {
          setCallError("Could not access microphone");
          setCallStatus("idle");
          return;
        }

        setLocalStream(stream);

        const selfParticipant: Participant = {
          id: userId,
          name: chat.users?.find((u) => u.id === userId)?.name || "You",
          isMuted: false,
        };
        setCallParticipants([selfParticipant]);

        await audioStreamingService.startStreaming(
          (_event) => {
            // Audio streaming started
          },
          (pcmData: ArrayBuffer) => {
            wsService.sendAudioFrame(chat.id, pcmData, userId!);
          },
        );

        wsService.sendCallAccepted(chat.id, incomingCall.callerId, userId);
        setCallStatus("connected");
      } catch (err) {
        console.error("Failed to get local media:", err);
        setCallError("Could not access microphone");
        setCallStatus("idle");
      }
    }
  };

  const rejectCall = () => {
    if (incomingCall && userId) {
      wsService.sendCallRejected(chat.id, incomingCall.callerId, userId);
      setIncomingCall(null);
      setCallStatus("idle");
    }
  };

  const toggleMute = () => {
    const muted = webRTCService.toggleMute();
    setIsMuted(muted);
  };

  const handleDeviceChange = async (
    deviceId: string,
    kind: "audioinput" | "videoinput",
  ) => {
    if (kind === "audioinput") {
      await webRTCService.switchAudioDevice(deviceId);
    }
  };

  const toggleAudioMute = () => {
    const muted = audioStreamingService.toggleMute();
    setAudioMuted(muted);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

  return (
    <div className="chat-view-container">
      {callStatus !== "idle" && localStream && (
        <div className="call-panel">
          <VideoCallModal
            chat={chat}
            localStream={localStream}
            status={callStatus}
            isMuted={isMuted}
            onEndCall={endCall}
            onToggleMute={toggleMute}
            onDeviceChange={handleDeviceChange}
            audioMuted={audioMuted}
            onToggleAudioMute={toggleAudioMute}
            participants={callParticipants}
            localUserId={userId || 0}
          />
        </div>
      )}
      <div className="chat-panel">
        <header>
          <button onClick={onBack}>← Back</button>
          <h2>{chat.name}</h2>
          <button
            className="call-btn"
            onClick={startCall}
            disabled={callStatus !== "idle"}
          >
            📞
          </button>
        </header>
        {callError && (
          <div className="call-error">
            {callError}
            <button onClick={() => setCallError(null)}>×</button>
          </div>
        )}
        <div className="messages">
          {messages.map((m, i) => (
            <div key={`${String(m.id)}-${i}`} className="message">
              <p>{m.content}</p>
              <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form onSubmit={handleSend}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
          />
          <button type="submit">Send</button>
        </form>
      </div>

      {incomingCall && (
        <IncomingCallModal
          chat={chat}
          callerName={incomingCall.callerName}
          isGroup={isGroupCall || (chat.users?.length || 0) >= 3}
          participants={
            chat.users?.filter((u) => groupCallParticipants.includes(u.id)) ||
            []
          }
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
