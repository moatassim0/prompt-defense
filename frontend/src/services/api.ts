import axios from 'axios';
import {
  Attack,
  Defense,
  QueryRequest,
  QueryResponse,
  UploadResponse,
  ComparisonRequest,
  ComparisonResponse,
} from '../../../shared/types';

const API_BASE = '/api';

axios.defaults.withCredentials = true;
axios.defaults.timeout = 15000;

function clearStoredSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

// ── Helper for retrying requests (useful for Neon auto-suspend) ─────────────
const fetchWithRetry = async (url: string, retries = 3, delayMs = 2000): Promise<any> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { timeout: 15000 });
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
};


export const api = {
  // Health check
  async checkHealth() {
    const response = await axios.get(`${API_BASE}/health`);
    return response.data;
  },

  // Documents
  async getDocuments() {
    const response = await axios.get(`${API_BASE}/documents`);
    return response.data;
  },

  async uploadDocument(file: File, applySanitization: boolean = false): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('applySanitization', applySanitization.toString());

    const response = await axios.post(`${API_BASE}/documents/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async deleteDocument(id: string) {
    const response = await axios.delete(`${API_BASE}/documents/${id}`);
    return response.data;
  },

  async clearDocuments() {
    const response = await axios.delete(`${API_BASE}/documents`);
    return response.data;
  },

  // Attacks
  async getAttacks(): Promise<Attack[]> {
    const response = await axios.get(`${API_BASE}/attacks`);
    return response.data;
  },


  async createAttack(data: {
    name: string;
    description: string;
    injectionText: string;
    category: string;
    tier: string;
    howItWorks?: string;
    mechanism?: string;
    impact?: string;
    example?: string;
  }): Promise<Attack> {
    const response = await axios.post(`${API_BASE}/attacks`, data);
    return response.data;
  },

  async deleteAttack(attackId: string): Promise<void> {
    await axios.delete(`${API_BASE}/attacks/${attackId}`);
  },

  async getDefenses(): Promise<Defense[]> {
    const response = await axios.get(`${API_BASE}/defenses`);
    return response.data;
  },

  async toggleDefense(defenseId: string): Promise<Defense> {
    const response = await axios.patch(`${API_BASE}/defenses/${defenseId}`);
    return response.data;
  },

  // Query
  async query(request: QueryRequest): Promise<QueryResponse> {
    const response = await axios.post(`${API_BASE}/query`, request);
    return response.data;
  },

  // Comparison
  async runComparison(request: ComparisonRequest): Promise<ComparisonResponse> {
    const response = await axios.post(`${API_BASE}/comparison`, request);
    return response.data;
  },

  async compareProviders(request: { prompt: string; providers: string[] }) {
    const response = await axios.post(`${API_BASE}/llm-compare`, request);
    return response.data as {
      results: Array<{
        provider: string;
        response: string;
        success: boolean;
        executionTimeMs: number;
        error?: string;
        tokenCount?: number;
      }>;
    };
  },

  // Traces
  async getTestTraces(params: { limit: number; offset: number; testRunId?: number; success?: boolean; llmProvider?: string; attackType?: string }): Promise<import('../../../shared/types').TestTraceResponse> {
    const query = new URLSearchParams();
    query.append('limit', params.limit.toString());
    query.append('offset', params.offset.toString());
    if (params.testRunId !== undefined) query.append('testRunId', params.testRunId.toString());
    if (params.success !== undefined) query.append('success', params.success.toString());
    if (params.llmProvider) query.append('llmProvider', params.llmProvider);
    if (params.attackType) query.append('attackType', params.attackType);

    const response = await axios.get(`${API_BASE}/testing/traces?${query.toString()}`);
    return response.data;
  },

  async getRandomPrompt(): Promise<{ prompt: string }> {
    const response = await axios.get(`${API_BASE}/testing/random-prompt`);
    return response.data;
  },



  async createUser(payload: { email: string; password: string; displayName?: string; role: 'super_admin' | 'admin' | 'user' }) {
    const response = await axios.post(`${API_BASE}/auth/register`, payload);
    return response.data;
  },

  async resetPassword(userId: string, newPassword: string) {
    const response = await axios.post(`${API_BASE}/auth/reset-password`, { userId, newPassword });
    return response.data;
  },

  async getUsers() {
    const response = await axios.get(`${API_BASE}/auth/users`);
    return response.data;
  },

  async deleteUser(id: string) {
    const response = await axios.delete(`${API_BASE}/auth/users/${id}`);
    return response.data;
  },

  // Analytics
  async getAnalyticsSummary() {
    const response = await fetchWithRetry(`${API_BASE}/analytics/all`);
    return response.data;
  },

  async exportAnalyticsCSV() {
    const response = await axios.get(`${API_BASE}/analytics/export-csv`, { responseType: 'blob' });
    return response.data;
  },
};

export {
  ACCESS_TOKEN_KEY,
  AUTH_USER_KEY,
  EXIT_LOGOUT_MARKER_KEY,
  clearStoredSession,
};
