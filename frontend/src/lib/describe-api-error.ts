import axios from 'axios';
import { isSuppressedAuth401Error } from '@/services/api';

/** Human-readable breakdown for API/network failures — use for toast + inline UI. */
export interface DescribedApiError {
  title: string;
  detail?: string;
}

export function describeApiError(error: unknown): DescribedApiError {
  if (isSuppressedAuth401Error(error)) {
    return { title: 'Signing out…' };
  }

  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message ?? '')) {
      return {
        title: 'Request timed out',
        detail:
          'The server stopped responding within the client limit. Retry with shorter context or fewer documents.',
      };
    }

    const status = error.response?.status;
    const raw = error.response?.data;
    let serverErr: string | undefined;
    if (raw !== null && typeof raw === 'object') {
      if ('error' in raw && typeof (raw as { error: unknown }).error === 'string') {
        serverErr = (raw as { error: string }).error;
      } else if ('message' in raw && typeof (raw as { message: unknown }).message === 'string') {
        serverErr = (raw as { message: string }).message;
      }
    }

    if (status === undefined) {
      return {
        title: 'Cannot reach the backend',
        detail: 'Verify the API is running at the expected URL (e.g. Vite proxy to port 3001) and try again.',
      };
    }

    if (status === 401) {
      return { title: 'Session expired', detail: 'Sign in again to continue.' };
    }
    if (status === 403) {
      return {
        title: 'Access denied',
        detail: 'This account cannot run that lab action.',
      };
    }
    if (status === 429) {
      return {
        title: 'Too many requests',
        detail: 'Rate limiting is active. Wait briefly and retry.',
      };
    }
    if (status === 400) {
      return {
        title: serverErr ?? 'Bad request',
        detail: serverErr ? undefined : 'Check inputs (prompt, documents, or batch size).',
      };
    }
    if (status === 502 || status === 503) {
      return {
        title: 'LLM upstream unavailable',
        detail:
          serverErr ??
          'The inference provider or gateway rejected the request. Confirm API keys and quotas.',
      };
    }
    if (status >= 500) {
      return {
        title: 'Server error',
        detail: serverErr ?? `HTTP ${status}. Retry later.`,
      };
    }

    return {
      title: serverErr ?? `Request failed (${status})`,
    };
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return { title: 'Cancelled' };
    }
    return {
      title: error.message || 'Something went wrong',
    };
  }

  return { title: 'Something went wrong', detail: 'An unexpected error occurred.' };
}

export function formatDescribedApiError(d: DescribedApiError): string {
  return d.detail ? `${d.title} — ${d.detail}` : d.title;
}

export function formatApiErrorForUser(error: unknown): string {
  return formatDescribedApiError(describeApiError(error));
}
