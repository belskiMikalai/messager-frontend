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