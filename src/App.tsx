import { useState, useEffect, useRef, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { messagesApi, usersApi } from "./services/api";
import { wsService, WsMessageType } from "./services/ws";
import { webRTCService } from "./services/webrtc";
import { VideoCallModal, IncomingCallModal } from "./components/VideoCallModal";
import type { Chat, Message, User } from "./types";
import "./App.css";

function AppContent() {
  const { isLoggedIn, login, register, logout, chats, refreshChats, userId } = useAuth();
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
        fd.get("password") as string
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
        // Ignore own messages (but not our own call responses)
        if (msg.payload.senderId === userId && 
            msg.type !== WsMessageType.CALL_ACCEPTED && 
            msg.type !== WsMessageType.CALL_REJECTED) return;
        
        // For targetId messages, only allow OFFER/ANSWER/ICE/CALL_ACCEPTED/CALL_REJECTED
        const isTargetedMessage = msg.payload.targetId === userId;
        const isAllowedTargeted = 
          msg.type === WsMessageType.OFFER ||
          msg.type === WsMessageType.ANSWER ||
          msg.type === WsMessageType.ICE_CANDIDATE ||
          msg.type === WsMessageType.CALL_ACCEPTED ||
          msg.type === WsMessageType.CALL_REJECTED;
        
        if (isTargetedMessage && !isAllowedTargeted) return;

        // For chat messages, only process if in current chat
        const isChatMessage = 
          msg.type === WsMessageType.MESSAGE_CREATED ||
          msg.type === WsMessageType.CALL_INITIATED;
        
        if (isChatMessage && msg.payload.chatId !== chat.id) return;

        // Handle messages - with deduplication
        if (msg.type === WsMessageType.MESSAGE_CREATED) {
          // Skip if content looks like WebRTC signaling
          const content = msg.payload.content;
          if (content && content.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(content);
              // Check for WebRTC SDP or ICE candidates - don't show in chat
              if (parsed.sdp || parsed.type === 'offer' || parsed.type === 'answer' || 
                  parsed.candidate || (parsed.candidates && parsed.candidates.length > 0) ||
                  (typeof parsed === 'string' && parsed.includes('candidate'))) {
                return; // Skip this message - don't show in chat
              }
            } catch {}
          }
          
          // Generate unique ID - always use a combination to ensure uniqueness
          const msgId = msg.payload.messageId 
            ? msg.payload.messageId 
            : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          setMessages((prev) => {
            // Deduplicate - check if message already exists by id or by content + recent time
            const existsById = prev.some(m => 
              msg.payload.messageId && m.id === msg.payload.messageId
            );
            const isDuplicate = existsById || prev.some(m => 
              m.content === msg.payload.content && 
              Math.abs(new Date(m.createdAt).getTime() - Date.now()) < 2000
            );
            if (isDuplicate) {
              return prev;
            }
            return [
              ...prev,
              {
                id: msgId,
                content: msg.payload.content,
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
            <input name="password" type="password" placeholder="Password" required />
            <button type="submit">Login</button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <input name="name" placeholder="Name" required />
            <input name="email" type="email" placeholder="Email" required />
            <input name="password" type="password" placeholder="Password" required />
            <button type="submit">Register</button>
          </form>
        )}
        <p className="switch">
          {view === "login" ? (
            <button onClick={() => { setView("register"); setError(""); }}>Need account?</button>
          ) : (
            <button onClick={() => { setView("login"); setError(""); }}>Have account?</button>
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
        onBack={() => { setActiveChat(null); wsService.disconnect(); }}
      />
    );
  }

  return (
    <div className="chats-container">
      <header>
        <h1>Chats</h1>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)}>+ New Chat</button>
          <button className="logout" onClick={logout}>Logout</button>
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

function CreateChatModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
    setSelectedUsers(prev => 
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    );
  };

  const createChat = async () => {
    if (!name.trim()) {
      setError("Chat name is required");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("http://localhost:9001/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), users: selectedUsers.map(u => u.id) }),
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
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Chat</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <input
            type="text"
            placeholder="Chat name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          
          {selectedUsers.length > 0 && (
            <div className="selected-users">
              {selectedUsers.map(u => (
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
            onChange={e => setSearch(e.target.value)}
          />

          {loading && <p className="loading">Searching...</p>}
          
          {!loading && users.length > 0 && (
            <div className="user-list">
              {users.map(u => (
                <div
                  key={u.id}
                  className={`user-item ${selectedUsers.find(su => su.id === u.id) ? 'selected' : ''}`}
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
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button className="create" onClick={createChat} disabled={creating}>
            {creating ? "Creating..." : "Create Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatView({ chat, messages, userId, onSend, onBack }: {
  chat: Chat;
  messages: Message[];
  userId: number | null;
  onSend: (msg: string) => void;
  onBack: () => void;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const [callError, setCallError] = useState<string | null>(null);
  
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "ringing" | "connected">("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ callerId: number; callerName: string } | null>(null);

  const callStatusRef = useRef(callStatus);
  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  const endCall = useCallback(() => {
    webRTCService.endCall();
    setCallStatus("idle");
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  const initiateWebRTCCall = useCallback(async (calleeId: number) => {
    const offer = await webRTCService.createOffer();
    if (offer) {
      wsService.sendOffer(chat.id, JSON.stringify(offer), calleeId, userId!);
      setCallStatus("connected");
    }
  }, [chat.id, userId]);

  const handleOffer = useCallback(async (sdp: string, fromId: number) => {
    await webRTCService.initTURN();

    let stream: MediaStream | null = null;
    try {
      stream = await webRTCService.startCall(chat.id, (event, data) => {
        if (event === "remote_stream") {
          setRemoteStream(data as MediaStream);
          setCallStatus("connected");
        } else if (event === "ended") {
          endCall();
        }
      }, (candidate) => {
        wsService.sendIceCandidate(chat.id, JSON.stringify(candidate), fromId, userId!);
      });
    } catch (err) {
      console.error("Failed to start call (camera access):", err);
      wsService.sendCallRejected(chat.id, fromId, userId!);
      setIncomingCall(null);
      setCallStatus("idle");
      setCallError("Could not access camera/microphone. Please check permissions.");
      return;
    }
    
    if (!stream) {
      wsService.sendCallRejected(chat.id, fromId, userId!);
      setIncomingCall(null);
      setCallStatus("idle");
      setCallError("Could not access camera/microphone");
      return;
    }
    
    setLocalStream(stream);

    const offer = JSON.parse(sdp);
    const answer = await webRTCService.handleOffer(offer);
    if (answer) {
      wsService.sendAnswer(chat.id, JSON.stringify(answer), fromId, userId!);
      setCallStatus("connected");
    }
  }, [chat.id, endCall, userId]);

  const handleAnswer = useCallback(async (sdp: string) => {
    const answer = JSON.parse(sdp);
    await webRTCService.handleAnswer(answer);
    setCallStatus("connected");
  }, []);

  const handleIceCandidate = useCallback(async (candidate: string) => {
    const cand = JSON.parse(candidate);
    await webRTCService.addIceCandidate(cand);
  }, []);

  const callHandlersRef = useRef({
    initiateWebRTCCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    endCall,
  });
  callHandlersRef.current = {
    initiateWebRTCCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    endCall,
  };

  useEffect(() => {
    const unsubscribe = wsService.onMessage((msg) => {
      const { initiateWebRTCCall: doOffer, handleOffer, handleAnswer, handleIceCandidate, endCall: hangUp } =
        callHandlersRef.current;

      if (msg.payload.senderId === userId &&
          msg.type !== WsMessageType.CALL_ACCEPTED &&
          msg.type !== WsMessageType.CALL_REJECTED) return;

      const isTargetedMessage = msg.payload.targetId === userId;
      const isAllowedTargeted =
        msg.type === WsMessageType.OFFER ||
        msg.type === WsMessageType.ANSWER ||
        msg.type === WsMessageType.ICE_CANDIDATE ||
        msg.type === WsMessageType.CALL_ACCEPTED ||
        msg.type === WsMessageType.CALL_REJECTED;

      if (isTargetedMessage && !isAllowedTargeted) return;

      const isChatMessage =
        msg.type === WsMessageType.MESSAGE_CREATED ||
        msg.type === WsMessageType.CALL_INITIATED;

      if (isChatMessage && msg.payload.chatId !== chat.id) return;

      switch (msg.type) {
        case WsMessageType.CALL_INITIATED:
          setIncomingCall({ callerId: msg.payload.senderId || 0, callerName: "User" });
          setCallStatus("ringing");
          break;

        case WsMessageType.CALL_ACCEPTED:
          if (callStatusRef.current === "calling" && msg.payload.targetId === userId) {
            void doOffer(msg.payload.senderId!);
          }
          break;

        case WsMessageType.CALL_REJECTED:
          setCallError(msg.payload.content || "Call was rejected");
          hangUp();
          break;

        case WsMessageType.OFFER:
          if (msg.payload.targetId === userId) {
            handleOffer(msg.payload.content, msg.payload.senderId!).catch((err) => {
              console.error("Failed to handle offer:", err);
              wsService.sendCallRejected(chat.id, msg.payload.senderId!, userId!);
              setIncomingCall(null);
              setCallStatus("idle");
              setCallError("Could not access camera/microphone");
            });
          }
          break;

        case WsMessageType.ANSWER:
          if (msg.payload.targetId === userId) {
            void handleAnswer(msg.payload.content);
          }
          break;

        case WsMessageType.ICE_CANDIDATE:
          if (msg.payload.targetId === userId) {
            void handleIceCandidate(msg.payload.content);
          }
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [chat.id, userId]);

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
    
    await webRTCService.initTURN();
    
    const stream = await webRTCService.startCall(chat.id, (event, data) => {
      if (event === "remote_stream") {
        setRemoteStream(data as MediaStream);
        setCallStatus("connected");
      } else if (event === "ended") {
        endCall();
      }
    }, (candidate) => {
      const callee = chat.users?.find(u => u.id !== userId);
      if (callee) {
        wsService.sendIceCandidate(chat.id, JSON.stringify(candidate), callee.id, userId!);
      }
    });

    if (stream) {
      setLocalStream(stream);
      setCallStatus("calling");
      wsService.sendCallInitiated(chat.id, userId);
      onSend("Starting new call");
    }
  };

  const acceptCall = async () => {
    if (incomingCall && userId) {
      setIncomingCall(null);
      setCallStatus("calling");
      wsService.sendCallAccepted(chat.id, incomingCall.callerId, userId);
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

  const toggleVideo = () => {
    const videoOff = webRTCService.toggleVideo();
    setIsVideoOff(videoOff);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

  return (
    <div className="chat-view">
      <header>
        <button onClick={onBack}>← Back</button>
        <h2>{chat.name}</h2>
        <button className="call-btn" onClick={startCall} disabled={callStatus !== "idle"}>
          📹
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
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." />
        <button type="submit">Send</button>
      </form>

      {callStatus !== "idle" && localStream && (
        <VideoCallModal
          chat={chat}
          localStream={localStream}
          remoteStream={remoteStream}
          status={callStatus}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          onEndCall={endCall}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
        />
      )}

      {incomingCall && (
        <IncomingCallModal
          chat={chat}
          callerName={incomingCall.callerName}
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