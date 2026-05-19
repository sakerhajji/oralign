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
        verificationStatus:
          (data as { verificationStatus?: VerificationStatus })
            .verificationStatus ?? VerificationStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Account created! Please verify your email.');
      router.push('/auth/verify-email');
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Failed to create account'));
    },
  });
}

/**
 * Hook for sign-in.
 *
 * Post-login routing — every gate is double-checked by OnboardingGuard so
 * the dashboard layout itself stays defensive, but routing the user to the
 * right place from here avoids an extra redirect flash:
 *   1. Email not verified                  → /auth/verify-email
 *   2. Dentist profile/clinic missing      → /onboarding/profile (or /clinic)
 *   3. Dentist waiting for admin approval  → /onboarding/pending
 *   4. Everything good                     → /dashboard
 */
export function useSignIn() {
  const router = useRouter();
  const { login } = useAuth();

  return useMutation<AuthResponseDto, unknown, SignInDto>({
    mutationFn: authService.signIn,
    onSuccess: (data) => {
      const verificationStatus =
        (data as { verificationStatus?: VerificationStatus })
          .verificationStatus ?? VerificationStatus.PENDING;
      login({
        id: data.id,
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        isEmailVerified: data.isEmailVerified,
        isActive: true,
        verificationStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Logged in successfully!');

      if (!data.isEmailVerified) {
        // Just route them to the verify page — DON'T fire an automatic
        // resend. The original signup email is almost certainly still valid
        // (15 min TTL), and a silent resend overwrites that code with a new
        // one, breaking the user's first attempt. The page has a visible
        // "Resend code" button if they need it.
        router.push('/auth/verify-email');
        return;
      }

      // For dentists, OnboardingGuard inside /dashboard will inspect the
      // freshly-fetched profile + working-hours + approval state and push
      // them deeper into the flow as needed. Sending them to /dashboard
      // first keeps the routing logic in one place.
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
    onError: (error: unknown) => {
      // The backend's BadRequestException carries a useful message
      // ("Invalid verification code", "Verification code has expired", …).
      // `error.message` on an Axios error is "Request failed with status
      // code 400", which hides that information from the user. Always go
      // through getApiErrorMessage to unwrap the response body.
      toast.error(getApiErrorMessage(error, 'Failed to verify email'));
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
      toast.error(getApiErrorMessage(error, 'Failed to send reset email'));
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
