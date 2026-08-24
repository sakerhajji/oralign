'use client';

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, UserRole } from '@/lib/types';
import { getAccessToken, getRefreshToken, clearTokens } from '@/lib/api';
import { usersService } from '@/lib/api/users.service';
import { userKeys } from '@/lib/hooks/use-users';
import { applyStoredLang } from '@/lib/i18n/use-lang';
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

/**
 * `/auth/sign-in` intentionally returns a compact session payload. It does
 * not contain the dentist profile or working hours used by the onboarding
 * guard, whereas `/users/me` always does. Do not mark a compact response as
 * the current-user cache entry or the guard can briefly mistake a completed
 * dentist profile for an empty one after login.
 */
function isCurrentUserSnapshot(user: User): boolean {
  return Object.prototype.hasOwnProperty.call(user, 'dentistProfile');
}

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
}

/**
 * ONE source of truth for "who is signed in".
 *
 * The current user lives in the React Query cache under
 * `userKeys.currentUser()` — the same entry `useCurrentUser()` reads —
 * and this provider is a thin view over it. Previously the provider kept
 * its own `useState<User>` copy fetched independently of the RQ entry, so
 * the two could disagree (profile edits patched both by hand, and
 * `useAccountData` had an effect syncing RQ back into the provider). Now a
 * profile mutation only has to `setQueryData` / `invalidateQueries` and
 * every consumer — `useAuth().user`, `useCurrentUser()`, the account page —
 * sees the same object at the same time.
 */
export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Whether the browser holds a session (access or refresh token). Read in
  // an effect, not during render: localStorage is unavailable during SSR
  // and the first client render must match the server markup.
  const [hasSession, setHasSession] = React.useState(false);
  React.useEffect(() => {
    setHasSession(!!getAccessToken() || !!getRefreshToken());
  }, []);

  const currentUser = useQuery<User, Error>({
    queryKey: userKeys.currentUser(),
    queryFn: usersService.getCurrentUser,
    enabled: hasSession,
    initialData: initialUser ?? undefined,
    staleTime: 1000 * 60 * 10,
    // A definitive failure means the session is dead (the API client has
    // already tried the refresh-token dance); do not hammer the endpoint.
    retry: false,
  });

  const user = hasSession ? (currentUser.data ?? null) : null;

  // /users/me failed with a token present → the session is unusable.
  // Drop it so the app renders signed-out instead of half-authenticated.
  React.useEffect(() => {
    if (!currentUser.isError) return;
    clearTokens();
    setHasSession(false);
    queryClient.removeQueries({ queryKey: userKeys.currentUser() });
  }, [currentUser.isError, queryClient]);

  const isAuthenticated = useMemo(() => !!user && hasSession, [user, hasSession]);

  const isAdmin = useMemo(
    () => user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN,
    [user],
  );

  const isDentist = useMemo(() => user?.role === UserRole.DENTIST, [user]);

  /**
   * Start a session from an auth or profile response.
   *
   * Profile endpoints return the full `/users/me` shape and can safely seed
   * the cache. Auth endpoints return only identity/token fields, so we clear
   * any old snapshot and let the enabled current-user query hydrate the full
   * account before onboarding access is evaluated.
   */
  const login = useCallback(
    (userData: User) => {
      if (isCurrentUserSnapshot(userData)) {
        queryClient.setQueryData<User>(userKeys.currentUser(), userData);
      } else {
        queryClient.removeQueries({
          queryKey: userKeys.currentUser(),
          exact: true,
        });
      }
      setHasSession(true);
    },
    [queryClient],
  );

  const logout = useCallback(
    (redirect: boolean = true) => {
      clearTokens();
      setHasSession(false);
      queryClient.removeQueries({ queryKey: userKeys.currentUser() });
      if (redirect) {
        router.replace('/login');
      }
    },
    [queryClient, router],
  );

  const hasRole = useCallback((role: UserRole): boolean => user?.role === role, [user]);

  // Apply the user's stored language preference on load / change.
  React.useEffect(() => {
    if (user?.preferredLanguage) {
      applyStoredLang(user.preferredLanguage);
    }
  }, [user?.preferredLanguage]);

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
