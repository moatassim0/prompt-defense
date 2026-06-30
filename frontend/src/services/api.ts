import axios from 'axios';
import {
  Attack,
  Defense,
  QueryRequest,
  QueryResponse,
  UploadResponse,
  SimulatorRequest,
  SimulatorResponse,
} from '../../../shared/types';
import { shouldSuppressAuth401Toast } from '../lib/auth-toast-suppress';

const API_BASE = '/api';

/** Tag rejected by the response interceptor when a 401 occurs during intentional sign-out. */
export const suppressedAuth401Marker = { isSuppressedAuth: true as const };

export function isSuppressedAuth401Error(error: unknown): error is typeof suppressedAuth401Marker {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isSuppressedAuth' in error &&
    (error as { isSuppressedAuth?: boolean }).isSuppressedAuth === true
  );
}

axios.defaults.withCredentials = true;
axios.defaults.timeout = 15000;

// During intentional sign-out, replace 401 with an explicit tagged object so
// downstream handlers (e.g. bootstrap) do not confuse it with network failure.
axios.interceptors.response.use(undefined, (error) => {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    shouldSuppressAuth401Toast()
  ) {
    return Promise.reject(suppressedAuth401Marker);
  }
  return Promise.reject(error);
});

function shouldRetryRequestError(error: unknown): boolean {
  if (isSuppressedAuth401Error(error)) return false;
  if (!axios.isAxiosError(error)) return true;

  const status = error.response?.status;
  // No HTTP response usually means network/timeout issues.
  if (!status) return true;

  if (status === 401 || status === 403) return false;
  if (status === 429) return true;
  return status >= 500;
}

// ── Helper for retrying requests (useful for Neon auto-suspend) ─────────────
const fetchWithRetry = async (
  url: string,
  opts?: { retries?: number; delayMs?: number; signal?: AbortSignal },
): Promise<any> => {
  const retries = opts?.retries ?? 3;
  const delayMs = opts?.delayMs ?? 2000;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { timeout: 15000, signal: opts?.signal });
      return res;
    } catch (err) {
      if (!shouldRetryRequestError(err)) throw err;
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
};


export const api = {
  // Health check
  async checkHealth(options?: { signal?: AbortSignal }) {
    const response = await axios.get(`${API_BASE}/health`, { signal: options?.signal });
    return response.data;
  },

  // Documents
  async getDocuments(options?: { signal?: AbortSignal }) {
    const response = await axios.get(`${API_BASE}/documents`, { signal: options?.signal });
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

  async loadInfoBankDocument(
    filename: string,
    folder: 'clean' | 'poisoned',
  ): Promise<{ success: boolean; document: any }> {
    const response = await axios.post(`${API_BASE}/documents/load-infobank`, {
      filename,
      folder,
    });
    return response.data;
  },

  // Attacks
  async getAttacks(options?: { signal?: AbortSignal }): Promise<Attack[]> {
    const response = await axios.get(`${API_BASE}/attacks`, { signal: options?.signal });
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

  async getDefenses(options?: { signal?: AbortSignal }): Promise<Defense[]> {
    const response = await axios.get(`${API_BASE}/defenses`, { signal: options?.signal });
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

  // Simulator
  async runSimulator(request: SimulatorRequest): Promise<SimulatorResponse> {
    const response = await axios.post(`${API_BASE}/simulator`, request);
    return response.data;
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

  async getTestTraceByResultId(resultId: number): Promise<import('../../../shared/types').TestTrace> {
    const response = await axios.get(`${API_BASE}/testing/trace/${resultId}`);
    return response.data;
  },

  async getTestRuns(limit = 100): Promise<import('../../../shared/types').TestRunListItem[]> {
    const response = await axios.get(`${API_BASE}/testing/runs?limit=${limit}`);
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
  async getAnalyticsSummary(options?: { signal?: AbortSignal }) {
    const response = await fetchWithRetry(`${API_BASE}/analytics/all`, {
      signal: options?.signal,
    });
    return response.data;
  },

  async exportAnalyticsCSV() {
    const response = await axios.get(`${API_BASE}/analytics/export-csv`, { responseType: 'blob' });
    return response.data;
  },
};
