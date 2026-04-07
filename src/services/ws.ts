import { VITE_WS_BACKEND_URL } from "../types";

export const WsMessageType = {
  MESSAGE_CREATED: "MESSAGE_CREATED",
  SEND_MESSAGE: "SEND_MESSAGE",
  SUBSCRIBE: "SUBSCRIBE",
  CALL_INITIATED: "CALL_INITIATED",
  CALL_ACCEPTED: "CALL_ACCEPTED",
  CALL_REJECTED: "CALL_REJECTED",
  JOIN_GROUP_CALL: "JOIN_GROUP_CALL",
  LEAVE_GROUP_CALL: "LEAVE_GROUP_CALL",
  AUDIO_STREAM_START: "AUDIO_STREAM_START",
  AUDIO_STREAM_STOP: "AUDIO_STREAM_STOP",
  AUDIO_BROADCAST: "AUDIO_BROADCAST",
  OFFER: "OFFER",
  ANSWER: "ANSWER",
  ICE_CANDIDATE: "ICE_CANDIDATE",
  ERROR: "ERROR",
} as const;

export type WsMessageType = (typeof WsMessageType)[keyof typeof WsMessageType];

export interface WsMessagePayload {
  content?: string;
  chatId: number;
  messageId?: number;
  senderId?: number;
  targetId?: number;
  pcmData?: string | ArrayBuffer;
}

export interface WsMessage {
  id: string;
  type: WsMessageType;
  payload: WsMessagePayload;
}

type MessageHandler = (msg: WsMessage) => void;

const WS_BACKEND_URL = VITE_WS_BACKEND_URL;

class WsService {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private pendingSubscriptions: string[] = [];

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_BACKEND_URL);

      this.ws.onopen = () => {
        this.pendingSubscriptions.forEach((name) => this.subscribe(name));
        this.pendingSubscriptions = [];
        resolve();
      };

      this.ws.onerror = (e) => reject(e);

      this.ws.onmessage = (e) => {
        try {
          if (e.data instanceof ArrayBuffer) {
            this.handlers.forEach((h) =>
              h({
                id: "binary",
                type: WsMessageType.AUDIO_BROADCAST,
                payload: { pcmData: e.data },
              } as WsMessage),
            );
            return;
          }

          const msg: WsMessage = JSON.parse(e.data);
          if (msg.type !== WsMessageType.AUDIO_BROADCAST) {
            console.log(
              "📥 WS RECEIVED:",
              msg.type,
              "from:",
              msg.payload.senderId,
              "target:",
              msg.payload.targetId,
            );
          }
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

  sendCallInitiated(
    chatId: number,
    callerId: number,
    participants: number[] = [],
  ) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.CALL_INITIATED,
      payload: { content: "Starting new call", chatId, senderId: callerId },
    };
    console.log(
      "📤 WS SENT:",
      msg.type,
      "chatId:",
      chatId,
      "callerId:",
      callerId,
      "participants:",
      participants,
    );
    this.ws?.send(JSON.stringify(msg));
  }

  sendGroupCallStarted(
    chatId: number,
    initiatorId: number,
    participants: number[],
  ) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.JOIN_GROUP_CALL,
      payload: {
        content: JSON.stringify({ participants }),
        chatId,
        senderId: initiatorId,
      },
    };
    console.log(
      "📤 WS SENT: JOIN_GROUP_CALL chatId:",
      chatId,
      "participants:",
      participants,
    );
    this.ws?.send(JSON.stringify(msg));
  }

  sendGroupCallEnded(chatId: number, userId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.LEAVE_GROUP_CALL,
      payload: { content: "Call ended", chatId, senderId: userId },
    };
    console.log(
      "📤 WS SENT: LEAVE_GROUP_CALL chatId:",
      chatId,
      "userId:",
      userId,
    );
    this.ws?.send(JSON.stringify(msg));
  }

  sendCallAccepted(chatId: number, callerId: number, calleeId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.CALL_ACCEPTED,
      payload: {
        content: "Call accepted",
        chatId,
        senderId: calleeId,
        targetId: callerId,
      },
    };
    console.log(
      "📤 WS SENT:",
      msg.type,
      "chatId:",
      chatId,
      "target:",
      callerId,
    );
    this.ws?.send(JSON.stringify(msg));
  }

  sendCallRejected(chatId: number, callerId: number, calleeId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.CALL_REJECTED,
      payload: {
        content: "Call rejected",
        chatId,
        senderId: calleeId,
        targetId: callerId,
      },
    };
    console.log(
      "📤 WS SENT:",
      msg.type,
      "chatId:",
      chatId,
      "target:",
      callerId,
    );
    this.ws?.send(JSON.stringify(msg));
  }

  sendOffer(chatId: number, sdp: string, targetId: number, senderId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.OFFER,
      payload: { content: sdp, chatId, targetId, senderId },
    };
    console.log(
      "📤 WS SENT:",
      msg.type,
      "chatId:",
      chatId,
      "target:",
      targetId,
      "sender:",
      senderId,
      "sdpType:",
      JSON.parse(sdp).type,
    );
    this.ws?.send(JSON.stringify(msg));
  }

  sendAnswer(chatId: number, sdp: string, targetId: number, senderId: number) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.ANSWER,
      payload: { content: sdp, chatId, targetId, senderId },
    };
    console.log(
      "📤 WS SENT:",
      msg.type,
      "chatId:",
      chatId,
      "target:",
      targetId,
      "sender:",
      senderId,
      "sdpType:",
      JSON.parse(sdp).type,
    );
    this.ws?.send(JSON.stringify(msg));
  }

  sendIceCandidate(
    chatId: number,
    candidate: string,
    targetId: number,
    senderId: number,
  ) {
    const msg: WsMessage = {
      id: crypto.randomUUID(),
      type: WsMessageType.ICE_CANDIDATE,
      payload: { content: candidate, chatId, targetId, senderId },
    };
    const parsed = JSON.parse(candidate);
    console.log(
      "📤 WS SENT:",
      msg.type,
      "chatId:",
      chatId,
      "target:",
      targetId,
      "sender:",
      senderId,
      "candidateType:",
      parsed.type,
    );
    this.ws?.send(JSON.stringify(msg));
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  sendAudioFrame(chatId: number, pcmData: ArrayBuffer, senderId: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const base64 = this.arrayBufferToBase64(pcmData);
    const msg = {
      id: crypto.randomUUID(),
      type: WsMessageType.AUDIO_BROADCAST,
      payload: { chatId, senderId, pcmData: base64 },
    };
    this.ws.send(JSON.stringify(msg));
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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

