import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type SessionState = {
  actorUserId: string;
  accessToken: string;
  tokenExpiresAt: string;
  setActorUserId: (userId: string) => void;
  setAccessToken: (token: string) => void;
  setTokenExpiresAt: (expiresAt: string) => void;
  clearSession: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      actorUserId: "",
      accessToken: "",
      tokenExpiresAt: "",
      setActorUserId: (actorUserId) => set({ actorUserId }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setTokenExpiresAt: (tokenExpiresAt) => set({ tokenExpiresAt }),
      clearSession: () => set({ actorUserId: "", accessToken: "", tokenExpiresAt: "" }),
    }),
    {
      name: "cookbook-club-mobile-session",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
