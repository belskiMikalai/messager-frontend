export const WsMessageType = {
  MESSAGE_CREATED: "MESSAGE_CREATED",
  SEND_MESSAGE: "SEND_MESSAGE",
  SUBSCRIBE: "SUBSCRIBE",
  CALL_INITIATED: "CALL_INITIATED",
  CALL_ACCEPTED: "CALL_ACCEPTED",
  CALL_REJECTED: "CALL_REJECTED",
  OFFER: "OFFER",
  ANSWER: "ANSWER",
  ICE_CANDIDATE: "ICE_CANDIDATE",
  ERROR: "ERROR",
} as const;

export type WsMessageType = typeof WsMessageType[keyof typeof WsMessageType];

export interface WsMessage {
  id: string;
  type: WsMessageType;
  payload: {
    content: string;
    chatId: number;
    messageId?: number;
    senderId?: number;
    targetId?: number;
  };
}

type MessageHandler = (msg: WsMessage) => void;

class WsService {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private pendingSubscriptions: string[] = [];

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket("ws://localhost:9001/ws");

      this.ws.onopen = () => {
        this.pendingSubscriptions.forEach((name) => this.subscribe(name));
        this.pendingSubscriptions = [];
        resolve();
      };

      this.ws.onerror = (e) => reject(e);
      
      this.ws.onmessage = (e) => {
        try {
          const msg: WsMessage = JSON.parse(e.data);
          console.log("📥 WS RECEIVED:", msg.type, "from:", msg.payload.senderId, "target:", msg.payload.targetId);
          this.handlers.forEach((h) => h(msg));
        } catch {}
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  subscribe(chatName: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingSubscriptions.push(chatName);
      return;
    }
    this.ws.send(JSON.stringify({ type: "SUBSCRIBE", payload: { chatName } }));
  }

  sendMessage(content: string, chatId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.SEND_MESSAGE,
      payload: { content, chatId },
    };
    console.log("📤 WS SENT:", msg.type, "chatId:", chatId);
    this.ws?.send(JSON.stringify(msg));
  }

  sendCallInitiated(chatId: number, callerId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.CALL_INITIATED,
      payload: { content: "Starting new call", chatId, senderId: callerId },
    };
    console.log("📤 WS SENT:", msg.type, "chatId:", chatId, "callerId:", callerId);
    this.ws?.send(JSON.stringify(msg));
  }

  sendCallAccepted(chatId: number, callerId: number, calleeId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.CALL_ACCEPTED,
      payload: { content: "Call accepted", chatId, senderId: calleeId, targetId: callerId },
    };
    console.log("📤 WS SENT:", msg.type, "chatId:", chatId, "target:", callerId);
    this.ws?.send(JSON.stringify(msg));
  }

  sendCallRejected(chatId: number, callerId: number, calleeId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.CALL_REJECTED,
      payload: { content: "Call rejected", chatId, senderId: calleeId, targetId: callerId },
    };
    console.log("📤 WS SENT:", msg.type, "chatId:", chatId, "target:", callerId);
    this.ws?.send(JSON.stringify(msg));
  }

  sendOffer(chatId: number, sdp: string, targetId: number, senderId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.OFFER,
      payload: { content: sdp, chatId, targetId, senderId },
    };
    console.log("📤 WS SENT:", msg.type, "chatId:", chatId, "target:", targetId, "sender:", senderId, "sdpType:", JSON.parse(sdp).type);
    this.ws?.send(JSON.stringify(msg));
  }

  sendAnswer(chatId: number, sdp: string, targetId: number, senderId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.ANSWER,
      payload: { content: sdp, chatId, targetId, senderId },
    };
    console.log("📤 WS SENT:", msg.type, "chatId:", chatId, "target:", targetId, "sender:", senderId, "sdpType:", JSON.parse(sdp).type);
    this.ws?.send(JSON.stringify(msg));
  }

  sendIceCandidate(chatId: number, candidate: string, targetId: number, senderId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.ICE_CANDIDATE,
      payload: { content: candidate, chatId, targetId, senderId },
    };
    const parsed = JSON.parse(candidate);
    console.log("📤 WS SENT:", msg.type, "chatId:", chatId, "target:", targetId, "sender:", senderId, "candidateType:", parsed.type);
    this.ws?.send(JSON.stringify(msg));
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WsService();