import { API_BASE_URL } from "../config";
import type {
  ApiError,
  AuthSession,
  Club,
  ClubStatus,
  Favorite,
  Meetup,
  Membership,
  PersonalCollection,
  Recipe,
  User,
} from "../types";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

let authTokenProvider: () => string = () => "";
let authSessionRefreshHandler: (() => Promise<AuthSession>) | null = null;
let authSessionUpdateHandler: ((session: AuthSession) => void) | null = null;
let authInvalidHandler: (() => void) | null = null;
let refreshingPromise: Promise<AuthSession> | null = null;

export function setAuthTokenProvider(provider: () => string) {
  authTokenProvider = provider;
}

export function setAuthSessionHandlers(handlers: {
  refresh: () => Promise<AuthSession>;
  onSessionUpdate: (session: AuthSession) => void;
  onUnauthorized: () => void;
}) {
  authSessionRefreshHandler = handlers.refresh;
  authSessionUpdateHandler = handlers.onSessionUpdate;
  authInvalidHandler = handlers.onUnauthorized;
}

async function performFetch<T>(
  path: string,
  options: RequestOptions = {},
  token = "",
): Promise<{
  ok: boolean;
  status: number;
  payload: T | ApiError;
}> {
  const headers = {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json()) as T | ApiError;
  return { ok: response.ok, status: response.status, payload };
}

async function refreshAuthSession(): Promise<AuthSession> {
  if (!authSessionRefreshHandler) {
    throw new Error("Session refresh is not configured.");
  }
  if (refreshingPromise) {
    return refreshingPromise;
  }

  refreshingPromise = authSessionRefreshHandler().finally(() => {
    refreshingPromise = null;
  });

  const session = await refreshingPromise;
  if (authSessionUpdateHandler) {
    authSessionUpdateHandler(session);
  }
  return session;
}

function shouldSkipAutoRefresh(path: string) {
  return path === "/api/auth/login" || path === "/api/auth/refresh" || path === "/api/auth/logout";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = authTokenProvider();
  const first = await performFetch<T>(path, options, token);
  if (first.ok) return first.payload as T;

  if (first.status === 401 && token && !shouldSkipAutoRefresh(path) && authSessionRefreshHandler) {
    try {
      const refreshed = await refreshAuthSession();
      const second = await performFetch<T>(path, options, refreshed.token);
      if (second.ok) return second.payload as T;
      const secondMessage =
        (second.payload as ApiError)?.error || `Request failed (${second.status})`;
      if (second.status === 401 && authInvalidHandler) {
        authInvalidHandler();
      }
      throw new Error(secondMessage);
    } catch (error) {
      if (authInvalidHandler) {
        authInvalidHandler();
      }
      throw error;
    }
  }

  if (first.status === 401 && authInvalidHandler) {
    authInvalidHandler();
  }
  const message = (first.payload as ApiError)?.error || `Request failed (${first.status})`;
  throw new Error(message);

  // unreachable
}

export const api = {
  login: (userId: string) =>
    request<AuthSession>("/api/auth/login", { method: "POST", body: { userId } }),
  refreshSession: () => request<AuthSession>("/api/auth/refresh", { method: "POST" }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  getSession: () =>
    request<{ expiresAt: string; user: { id: string; name: string } }>("/api/auth/session"),
  getStatus: () => request<ClubStatus>("/api/status"),
  getClub: () => request<{ club: Club; host: User; upcoming: Meetup | null }>("/api/club"),
  initClub: (input: {
    clubName: string;
    hostName: string;
    hostEmail?: string;
    hostPhone?: string;
  }) => request<{ club: Club; host: User }>("/api/club/init", { method: "POST", body: input }),
  listMembers: () => request<Membership[]>("/api/members"),
  createUser: (input: { name: string; email?: string; phone?: string }) =>
    request<User>("/api/users", { method: "POST", body: input }),
  inviteMember: (input: { actorUserId?: string; userId: string; role?: string }) =>
    request<Membership>("/api/members/invite", { method: "POST", body: input }),
  removeMember: (input: { actorUserId?: string; userId: string }) =>
    request<Membership>("/api/members/remove", { method: "POST", body: input }),
  getMeetup: () => request<Meetup | null>("/api/meetup"),
  scheduleMeetup: (input: { actorUserId?: string; isoDateTime: string }) =>
    request<Meetup>("/api/meetup/schedule", { method: "POST", body: input }),
  setHost: (input: { actorUserId?: string; newHostUserId: string }) =>
    request<{ club: Club; host: User }>("/api/host/set", { method: "POST", body: input }),
  listRecipes: (actorUserId?: string) => {
    const params = new URLSearchParams();
    if (actorUserId) params.set("actorUserId", actorUserId);
    const query = params.toString();
    return request<Recipe[]>(`/api/recipes${query ? `?${query}` : ""}`);
  },
  addRecipe: (input: {
    actorUserId?: string;
    title: string;
    description?: string;
    recipeIngredient?: string[];
    recipeInstructions?: { text: string }[];
    imageDataUrl?: string;
    imageFileName?: string;
  }) =>
    request<Recipe>("/api/recipes", {
      method: "POST",
      body: {
        ...input,
        name: input.title,
        content: input.description,
      },
    }),
  favoriteRecipe: (input: { actorUserId?: string; recipeId: string }) =>
    request<Favorite>("/api/favorites", { method: "POST", body: input }),
  addFavoriteToCollection: (input: {
    actorUserId?: string;
    recipeId: string;
    collectionName?: string;
  }) =>
    request<{ id: string; collectionId: string; recipeId: string; createdAt: string }>(
      "/api/collections",
      {
        method: "POST",
        body: input,
      },
    ),
  listCollections: (actorUserId?: string) => {
    const params = new URLSearchParams();
    if (actorUserId) params.set("actorUserId", actorUserId);
    const query = params.toString();
    return request<PersonalCollection[]>(`/api/collections${query ? `?${query}` : ""}`);
  },
  imageUrl: (path: string) => `${API_BASE_URL}/api/recipe-image?path=${encodeURIComponent(path)}`,
};
