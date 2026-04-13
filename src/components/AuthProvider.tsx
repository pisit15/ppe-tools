'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { validateCompanyPassword, getCompany } from '@/lib/companies';

type AuthState = {
  [companyId: string]: boolean;
};

type AuthContextType = {
  isLoggedIn: (companyId: string) => boolean;
  login: (companyId: string, password: string) => boolean;
  logout: (companyId: string) => void;
  logoutAll: () => void;
  getCompanyName: (companyId: string) => string;
};

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'tools_auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({});
  const [loaded, setLoaded] = useState(false);

  // Load auth state from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        setAuthState(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  // Save to sessionStorage on change
  useEffect(() => {
    if (loaded) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(authState));
      } catch {
        // ignore
      }
    }
  }, [authState, loaded]);

  const isLoggedIn = useCallback(
    (companyId: string) => !!authState[companyId],
    [authState]
  );

  const login = useCallback(
    (companyId: string, password: string): boolean => {
      if (validateCompanyPassword(companyId, password)) {
        setAuthState((prev) => ({ ...prev, [companyId]: true }));
        return true;
      }
      return false;
    },
    []
  );

  const logout = useCallback((companyId: string) => {
    setAuthState((prev) => {
      const next = { ...prev };
      delete next[companyId];
      return next;
    });
  }, []);

  const logoutAll = useCallback(() => {
    setAuthState({});
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const getCompanyName = useCallback((companyId: string) => {
    return getCompany(companyId)?.name || companyId;
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout, logoutAll, getCompanyName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
