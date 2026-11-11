import React from 'react';

import { getAppId, getAuthBaseUrl, getOAuthClientId } from '@deriv/shared';

import { APIContext } from './APIProvider';

const AUTH_INFO_KEY = 'auth_info';

let shared_refresh_promise: Promise<string | null> | null = null;

const refreshStoredToken = async (): Promise<string | null> => {
    if (shared_refresh_promise) return shared_refresh_promise;

    shared_refresh_promise = (async () => {
        try {
            const info = JSON.parse(sessionStorage.getItem(AUTH_INFO_KEY) ?? 'null');
            if (!info?.refresh_token) return null;

            const response = await fetch(`${getAuthBaseUrl()}/oauth2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: info.refresh_token,
                    client_id: getOAuthClientId(),
                }),
            });

            if (!response.ok) {
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    sessionStorage.removeItem(AUTH_INFO_KEY);
                }
                return null;
            }

            const data = await response.json();
            if (!data?.access_token) return null;

            sessionStorage.setItem(
                AUTH_INFO_KEY,
                JSON.stringify({
                    access_token: data.access_token,
                    refresh_token: data.refresh_token || info.refresh_token,
                    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
                })
            );
            return data.access_token as string;
        } catch {
            return null;
        } finally {
            shared_refresh_promise = null;
        }
    })();

    return shared_refresh_promise;
};

const getValidStoredToken = async (force_refresh = false): Promise<string | null> => {
    try {
        const info = JSON.parse(sessionStorage.getItem(AUTH_INFO_KEY) ?? 'null');
        if (!info) return null;
        const is_expiring = info.expires_at && Date.now() >= info.expires_at - 60_000;
        if (!force_refresh && info.access_token && !is_expiring) {
            return info.access_token;
        }
        if (info.refresh_token) {
            return await refreshStoredToken();
        }
        if (info.expires_at && Date.now() >= info.expires_at) {
            sessionStorage.removeItem(AUTH_INFO_KEY);
            return null;
        }
        return info.access_token ?? null;
    } catch {
        return null;
    }
};

/**
 * Hook to access REST API configuration from APIProvider
 * Provides centralized REST API base URL and fetch helper
 */
export const useRestAPI = () => {
    const context = React.useContext(APIContext);

    if (!context) {
        throw new Error('useRestAPI must be used within APIProvider');
    }

    const { restAPIConfig } = context;

    /**
     * Generic fetch wrapper with auth headers
     * @param endpoint - API endpoint path (e.g., '/trading/v1/options/accounts')
     * @param options - Optional fetch options
     * @returns Promise with typed response
     */
    const fetchREST = async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
        const url = `${restAPIConfig.baseUrl}${endpoint}`;

        // Determine the method (default to GET if not specified)
        const method = options?.method || 'GET';

        // Only set Content-Type for methods that have a body
        const shouldSetContentType = ['POST', 'PUT', 'PATCH'].includes(method);

        const executeFetch = async (token: string | null) => {
            const authHeaders: Record<string, string> = token
                ? { Authorization: `Bearer ${token}`, 'Deriv-App-ID': String(getAppId()) }
                : {};

            return fetch(url, {
                ...options,
                method,
                headers: {
                    ...authHeaders,
                    ...(shouldSetContentType && { 'Content-Type': 'application/json' }),
                    ...options?.headers,
                },
            });
        };

        const token = await getValidStoredToken();
        let response = await executeFetch(token);

        if (response.status === 401) {
            const refreshed_token = await getValidStoredToken(true);
            if (refreshed_token) {
                response = await executeFetch(refreshed_token);
            }
        }

        if (!response.ok) {
            // Try to parse error body for more detailed error information
            let errorBody;
            try {
                errorBody = await response.json();
            } catch {
                // If response body is not JSON, use generic error
                errorBody = null;
            }

            // Extract error message from API response if available
            const errorMessage =
                errorBody?.errors?.[0]?.message || `REST API Error: ${response.status} ${response.statusText}`;
            const errorCode = errorBody?.errors?.[0]?.code;

            // Create enhanced error with additional properties
            const error = new Error(errorMessage) as Error & {
                status: number;
                statusText: string;
                code?: string;
                body?: unknown;
                isAuthError: boolean;
            };

            error.status = response.status;
            error.statusText = response.statusText;
            error.code = errorCode;
            error.body = errorBody;
            error.isAuthError = response.status === 401 || response.status === 403;

            throw error;
        }

        const data = await response.json();

        return data;
    };

    return {
        baseUrl: restAPIConfig.baseUrl,
        fetchREST,
    };
};
