const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  owner_id: string;
  owner_name?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentMember {
  document_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
}

export interface SnapshotItem {
  id: string;
  document_id: string;
  version: number;
  content: string;
  op_count: number;
  created_by?: string;
  created_at: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("syncforge_token");
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("syncforge_token", token);
  }
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("syncforge_token");
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    let errMsg = "An error occurred";
    try {
      const errData = await res.json();
      errMsg = errData.error || errData.message || res.statusText;
    } catch {
      errMsg = await res.text() || res.statusText;
    }
    throw new Error(errMsg);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }

  return res.json();
}

export const api = {
  // Auth
  async register(data: { email: string; password: string; name: string }) {
    const res = await request<{ user: User; token: string }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (res.token) setToken(res.token);
    return res;
  },

  async login(data: { email: string; password: string }) {
    const res = await request<{ user: User; token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (res.token) setToken(res.token);
    return res;
  },

  async logout() {
    try {
      await request("/api/v1/auth/logout", { method: "POST" });
    } finally {
      clearToken();
    }
  },

  async getMe(): Promise<User> {
    return request<User>("/api/v1/auth/me");
  },

  // Documents
  async listDocuments(): Promise<DocumentItem[]> {
    const data = await request<DocumentItem[] | null>("/api/v1/documents");
    return data || [];
  },

  async getDocument(id: string): Promise<DocumentItem> {
    return request<DocumentItem>(`/api/v1/documents/${id}`);
  },

  async createDocument(title: string): Promise<DocumentItem> {
    return request<DocumentItem>("/api/v1/documents", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  },

  async updateDocument(id: string, title: string): Promise<DocumentItem> {
    return request<DocumentItem>(`/api/v1/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },

  async deleteDocument(id: string): Promise<void> {
    return request<void>(`/api/v1/documents/${id}`, {
      method: "DELETE",
    });
  },

  // Versions
  async listVersions(docId: string): Promise<SnapshotItem[]> {
    const data = await request<SnapshotItem[] | null>(`/api/v1/documents/${docId}/versions`);
    return data || [];
  },

  async restoreVersion(docId: string, version: number): Promise<void> {
    return request<void>(`/api/v1/documents/${docId}/versions/${version}/restore`, {
      method: "POST",
    });
  },

  // Members
  async listMembers(docId: string): Promise<DocumentMember[]> {
    const data = await request<DocumentMember[] | null>(`/api/v1/documents/${docId}/members`);
    return data || [];
  },

  async addMember(docId: string, email: string, role: "editor" | "viewer"): Promise<void> {
    return request<void>(`/api/v1/documents/${docId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  async removeMember(docId: string, userId: string): Promise<void> {
    return request<void>(`/api/v1/documents/${docId}/members/${userId}`, {
      method: "DELETE",
    });
  },

  // WebSocket Ticket
  async getWsTicket(docId: string): Promise<string> {
    const res = await request<{ ticket: string }>(`/api/v1/documents/${docId}/ws-ticket`, {
      method: "POST",
    });
    return res.ticket;
  },
};
