export const VITE_BACKEND_URL =
  "https://shares-weblog-surrounded-becoming.trycloudflare.com";
export const VITE_WS_BACKEND_URL =
  "wss://shares-weblog-surrounded-becoming.trycloudflare.com/ws";
export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Chat {
  id: number;
  name: string;
  users?: User[];
}

export interface Message {
  id: string | number;
  content: string;
  chatId: number;
  senderId: number;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface GroupCallInfo {
  chatId: number;
  initiatorId: number;
  initiatorName: string;
  participants: number[];
}

