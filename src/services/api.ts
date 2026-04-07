import type { SignInDto, RegisterDto } from "../dto/auth.dto";
import type { ChatDto } from "../dto/chat.dto";
import type { User, Chat, Message, ApiResponse } from "../types";

const BASE =
  import.meta.env.BACKEND_URL ??
  "https://towers-played-inquiry-continuous.trycloudflare.com/";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const authApi = {
  login: (data: SignInDto) =>
    request<ApiResponse<null>>("/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  register: (data: RegisterDto) =>
    request<ApiResponse<null>>("/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  logout: () =>
    request<ApiResponse<null>>("/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  me: () => request<ApiResponse<User>>("/me"),
};

export const usersApi = {
  search: (name: string) => request<ApiResponse<User[]>>(`/users/${name}`),
};

export const chatsApi = {
  create: (data: ChatDto) =>
    request<ApiResponse<Chat>>("/chats", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getAll: () => request<ApiResponse<Chat[]>>("/chats"),
};

export const messagesApi = {
  getByChat: (chatId: number) =>
    request<ApiResponse<Message[]>>(`/messages/${chatId}`),
};

