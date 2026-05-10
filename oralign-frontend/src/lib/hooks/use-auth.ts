'use client';

import {
  useMutation,
  UseMutationResult,
  useQuery,
  UseQueryResult,
  useQueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { authService } from '@/lib/api';
import { useAuth } from '@/lib/providers';
import {
  SignUpDto,
  SignInDto,
  VerifyEmailDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AuthResponseDto,
  MessageResponse,
  VerifyEmailResponseDto,
  VerificationStatus,
  UserRole,
} from '@/lib/types';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot reach the server. Check that the backend is running and try again.';
    }

    const apiData = error.response?.data as
      | { message?: string | string[]; errorCode?: string }
      | undefined;
    const apiMessage = apiData?.message;

    switch (apiData?.errorCode) {
      case 'EMAIL_NOT_FOUND':
        return 'No account was found with this email address.';
      case 'INVALID_PASSWORD':
        return typeof apiMessage === 'string'
          ? apiMessage
          : 'The password is incorrect.';
      case 'ACCOUNT_LOCKED':
        return typeof apiMessage === 'string'
          ? apiMessage
          : 'This account is temporarily locked after too many failed attempts.';
      case 'ACCOUNT_INACTIVE':
        return 'This account is deactivated. Please contact support.';
    }

    if (Array.isArray(apiMessage) && apiMessage.length > 0) {
      return apiMessage.join(', ');
    }
    if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
      return apiMessage;
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export function useBackendHealth(): UseQueryResult<
  { status: string; timestamp: string },
  Error
> {
  return useQuery<{ status: string; timestamp: string }, Error>({
    queryKey: ['backend-health'],
    queryFn: authService.checkHealth,
    retry: 1,
    refetchInterval: 15000,
  });
}

/**
 * Hook for user sign-up (dentist only — enforced on the backend).
 * On success redirects to email verification step.
 */
export function useSignUp() {
  const router = useRouter();
  const { login } = useAuth();

  return useMutation<AuthResponseDto, unknown, SignUpDto>({
    mutationFn: authService.signUp,
    onSuccess: (data) => {
      login({
        id: data.id,
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        isEmailVerified: data.isEmailVerified,
        isActive: true,
        verificationStatus: VerificationStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Account created! Please verify your email.');
      router.push('/auth/verify-email?onboarding=1');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to create account'));
    },
  });
}

/**
 * Hook for sign-in.
 *
 * After a successful login the redirect logic is:
 *   1. Email not verified  → /auth/verify-email?onboarding=1
 *   2. Dentist             → /account/profile?onboarding=1
 *      (the profile page redirects to /dashboard once onboarding is complete)
 *   3. Other roles         → /dashboard
 */
export function useSignIn() {
  const router = useRouter();
  const { login } = useAuth();

  return useMutation<AuthResponseDto, unknown, SignInDto>({
    mutationFn: authService.signIn,
    onSuccess: (data) => {
      login({
        id: data.id,
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        isEmailVerified: data.isEmailVerified,
        isActive: true,
        verificationStatus: VerificationStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Logged in successfully!');

      if (!data.isEmailVerified) {
        // Fire-and-forget: send a fresh OTP so the user has a valid code waiting.
        void authService.resendVerification({ email: data.email }).catch(() => {/* already logged */});
        router.push('/auth/verify-email?onboarding=1');
        return;
      }

      if (data.role === UserRole.DENTIST) {
        // The profile page handles further onboarding redirects
        // and eventually lands on /dashboard when complete.
        router.push('/account/profile?onboarding=1');
        return;
      }

      router.push('/dashboard');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Invalid credentials'));
    },
  });
}

/**
 * Hook for email verification.
 * On success, stores tokens and updates the auth context so the user is
 * immediately authenticated even if they reached the page via a direct link.
 */
export function useVerifyEmail(): UseMutationResult<VerifyEmailResponseDto, Error, VerifyEmailDto> {
  const { login } = useAuth();

  return useMutation<VerifyEmailResponseDto, Error, VerifyEmailDto>({
    mutationFn: authService.verifyEmail,
    onSuccess: (data) => {
      // Tokens are already stored by authService.verifyEmail.
      // Sync user into auth context so the profile page can read it immediately.
      if (data.user) {
        login({
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.fullName,
          role: data.user.role,
          isEmailVerified: data.user.isEmailVerified,
          isActive: true,
          verificationStatus: VerificationStatus.PENDING,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      toast.success('Email verified successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to verify email');
    },
  });
}

/**
 * Hook for resending the email verification code.
 */
export function useResendVerification(): UseMutationResult<
  MessageResponse,
  unknown,
  { email: string }
> {
  return useMutation<MessageResponse, unknown, { email: string }>({
    mutationFn: authService.resendVerification,
    onSuccess: () => {
      toast.success('A new verification code has been sent to your email.');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to resend code'));
    },
  });
}

/**
 * Hook for forgot password.
 */
export function useForgotPassword(): UseMutationResult<MessageResponse, Error, ForgotPasswordDto> {
  return useMutation<MessageResponse, Error, ForgotPasswordDto>({
    mutationFn: authService.forgotPassword,
    onSuccess: () => {
      toast.success('If that email exists, a reset link has been sent. Check your inbox.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send reset email');
    },
  });
}

/**
 * Hook for password reset.
 */
export function useResetPassword() {
  const router = useRouter();

  return useMutation<MessageResponse, unknown, ResetPasswordDto & { confirmPassword?: string }>({
    mutationFn: authService.resetPassword,
    onSuccess: () => {
      toast.success('Password reset successfully!');
      router.push('/login');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to reset password'));
    },
  });
}

/**
 * Hook for changing password (requires current password).
 * Calls the authenticated POST /auth/change-password endpoint.
 */
export function useChangePassword() {
  return useMutation<MessageResponse, unknown, { currentPassword: string; newPassword: string }>({
    mutationFn: authService.changePassword,
    onSuccess: () => {
      toast.success('Password changed successfully!');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to change password'));
    },
  });
}

/**
 * Hook for logout.
 */
export function useLogout() {
  const { logout } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.clear();
    authService.logout();
    logout(false);
    toast.success('Logged out successfully');
    router.replace('/login');
  }, [logout, router, queryClient]);
}
