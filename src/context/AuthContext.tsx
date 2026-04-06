import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { authApi, chatsApi } from "../services/api";
import type { Chat, User } from "../types";

interface AuthContextType {
  isLoggedIn: boolean;
  chats: Chat[];
  userId: number | null;
  user: User | null;
  login: (login: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshChats: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const refreshChats = async () => {
    const res = await chatsApi.getAll();
    if (res.success && res.data) setChats(res.data);
  };

  const fetchMe = async () => {
    try {
      const res = await authApi.me();
      if (res.success && res.data) {
        setUserId(res.data.id);
        setUser(res.data);
      }
    } catch {
      // Not logged in or error
    }
  };

  useEffect(() => {
    refreshChats()
      .then(fetchMe)
      .then(() => setIsLoggedIn(true))
      .catch(() => setIsLoggedIn(false));
  }, []);

  const login = async (login: string, password: string) => {
    await authApi.login({ login, password });
    setIsLoggedIn(true);
    await refreshChats();
    await fetchMe();
  };

  const register = async (name: string, email: string, password: string) => {
    await authApi.register({ name, email, password });
    setIsLoggedIn(true);
    await refreshChats();
    await fetchMe();
  };

  const logout = async () => {
    await authApi.logout();
    setIsLoggedIn(false);
    setChats([]);
    setUserId(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, chats, userId, user, login, register, logout, refreshChats }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}