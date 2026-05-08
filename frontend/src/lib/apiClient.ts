import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { MESSAGES } from '../constants/messages';
import { getActiveApiKey, getActiveProvider, useSettingsStore } from '../store/settingsStore';

export const API_BASE_URL = 'http://127.0.0.1:8000';

type RetryableConfig = AxiosRequestConfig & {
  _retry?: boolean;
};

interface RefreshResponse {
  accessToken?: string;
  access_token?: string;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

const AI_PATHS = ['/ask-ai/', '/api/ai/verify/'];
let refreshPromise: Promise<string | null> | null = null;

const normalizeUrl = (url?: string) => {
  if (!url) return '';
  return url.startsWith(API_BASE_URL) ? url.slice(API_BASE_URL.length) : url;
};

const getAccessToken = () => localStorage.getItem('autoMobile_accessToken');
const getRefreshToken = () => localStorage.getItem('autoMobile_refreshToken');

const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = axios
      .post<RefreshResponse>(`${API_BASE_URL}/api/auth/refresh/`, { refreshToken, refresh_token: refreshToken }, { timeout: 15000 })
      .then((response) => {
        const token = response.data.accessToken ?? response.data.access_token ?? null;
        if (token) localStorage.setItem('autoMobile_accessToken', token);
        return token;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

apiClient.interceptors.request.use((config) => {
  const url = normalizeUrl(config.url);
  config.url = url;

  const accessToken = getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  const isAiRequest = AI_PATHS.some((path) => url.includes(path));
  if (isAiRequest) {
    const apiKey = getActiveApiKey();
    const provider = getActiveProvider();
    const state = useSettingsStore.getState();
    const fallbackKey = provider === 'gemini' ? state.groqKey : state.geminiKey;
    config.headers.Authorization = apiKey ? `Bearer ${apiKey}` : config.headers.Authorization;
    config.headers['X-AI-Provider'] = provider;
    if (fallbackKey) {
      config.headers['X-AI-Fallback-Authorization'] = `Bearer ${fallbackKey}`;
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalConfig = error.config as RetryableConfig | undefined;

    if (status === 401 && originalConfig && !originalConfig._retry) {
      originalConfig._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        originalConfig.headers = {
          ...originalConfig.headers,
          Authorization: `Bearer ${token}`,
        };
        return apiClient.request(originalConfig);
      }

      toast.error(MESSAGES.common.networkError);
      return Promise.reject(error);
    }

    if (status === 429) {
      toast.error('API 호출 한도를 초과했습니다. 잠시 뒤 다시 시도해 주세요.');
    }

    return Promise.reject(error);
  }
);

export const isCanceledRequest = (error: unknown) =>
  axios.isCancel(error) || (error instanceof AxiosError && error.code === 'ERR_CANCELED');

export const getApiErrorMessage = (error: unknown, fallback: string = MESSAGES.common.serverError) => {
  if (error instanceof AxiosError) {
    const data = error.response?.data;
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
      return data.message;
    }
  }
  return fallback;
};
