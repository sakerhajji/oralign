'use client';

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { User, UserRole } from '@/lib/types';
import { getAccessToken, getRefreshToken, clearTokens } from '@/lib/api';
import { usersService } from '@/lib/api/users.service';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isDentist: boolean;
  login: (user: User) => void;
  logout: (redirect?: boolean) => void;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = React.useState<User | null>(initialUser);
  const router = useRouter();

  // Check if user is authenticated
  const isAuthenticated = useMemo(() => {
    return !!user && !!getAccessToken();
  }, [user]);

  // Check if user is admin
  const isAdmin = useMemo(() => {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  }, [user]);

  // Check if user is dentist
  const isDentist = useMemo(() => {
    return user?.role === UserRole.DENTIST;
  }, [user]);

  // Login function
  const login = useCallback((userData: User) => {
    setUser(userData);
  }, []);

  // Logout function
  const logout = useCallback((redirect: boolean = true) => {
    setUser(null);
    clearTokens();
    if (redirect) {
      router.replace('/login');
    }
  }, [router]);

  // Check if user has specific role
  const hasRole = useCallback(
    (role: UserRole): boolean => {
      return user?.role === role;
    },
    [user]
  );

  React.useEffect(() => {
    const token = getAccessToken();
    const refreshToken = getRefreshToken();

    if (!token && !refreshToken && user) {
      setUser(null);
      return;
    }

    if (!token || user) {
      return;
    }

    let isMounted = true;

    usersService
      .getCurrentUser()
      .then((currentUser) => {
        if (isMounted) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
          clearTokens();
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isAdmin,
      isDentist,
      login,
      logout,
      hasRole,
    }),
    [user, isAuthenticated, isAdmin, isDentist, login, logout, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
