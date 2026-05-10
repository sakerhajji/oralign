import apiClient, { setTokens, clearTokens } from './client';
import {
  SignUpDto,
  SignInDto,
  VerifyEmailDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  AuthResponseDto,
  AuthTokenDto,
  MessageResponse,
  VerifyEmailResponseDto,
} from '@/lib/types';

export const authService = {
  /**
   * Check backend availability.
   */
  checkHealth: async (): Promise<{ status: string; timestamp: string }> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Backend health check failed');
    }

    return response.json() as Promise<{ status: string; timestamp: string }>;
  },

  /**
   * Sign up a new user
   */
  signUp: async (data: SignUpDto): Promise<AuthResponseDto> => {
    const response = await apiClient.post<AuthResponseDto>('/auth/sign-up', data);
    
    // Store tokens on successful signup
    if (response.data.authToken) {
      setTokens(response.data.authToken.accessToken, response.data.authToken.refreshToken);
    }
    
    return response.data;
  },

  /**
   * Sign in an existing user
   */
  signIn: async (data: SignInDto): Promise<AuthResponseDto> => {
    const response = await apiClient.post<AuthResponseDto>('/auth/sign-in', data);
    
    // Store tokens on successful login
    if (response.data.authToken) {
      setTokens(response.data.authToken.accessToken, response.data.authToken.refreshToken);
    }
    
    return response.data;
  },

  /**
   * Verify email with verification code.
   * On success the backend returns tokens so the client can auto-login.
   */
  verifyEmail: async (data: VerifyEmailDto): Promise<VerifyEmailResponseDto> => {
    const response = await apiClient.post<VerifyEmailResponseDto>('/auth/verify-email', data);
    if (response.data.authToken) {
      setTokens(response.data.authToken.accessToken, response.data.authToken.refreshToken);
    }
    return response.data;
  },

  /**
   * Request password reset email
   */
  forgotPassword: async (data: ForgotPasswordDto): Promise<MessageResponse> => {
    const response = await apiClient.post<MessageResponse>('/auth/forgot-password', data);
    return response.data;
  },

  /**
   * Reset password with token
   */
  resetPassword: async (data: ResetPasswordDto & { confirmPassword?: string }): Promise<MessageResponse> => {
    const { token, newPassword } = data;
    const response = await apiClient.post<MessageResponse>('/auth/reset-password', {
      token,
      newPassword,
    });
    return response.data;
  },

  /**
   * Refresh access token using refresh token
   */
  refreshToken: async (data: RefreshTokenDto): Promise<AuthTokenDto> => {
    const response = await apiClient.post<AuthTokenDto>('/auth/refresh-token', data);
    
    // Update stored tokens
    if (response.data) {
      setTokens(response.data.accessToken, response.data.refreshToken);
    }
    
    return response.data;
  },

  /**
   * Resend email verification code
   */
  resendVerification: async (data: { email: string }): Promise<MessageResponse> => {
    const response = await apiClient.post<MessageResponse>('/auth/resend-verification', data);
    return response.data;
  },

  /**
   * Change password — requires current password (authenticated endpoint)
   */
  changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<MessageResponse> => {
    const response = await apiClient.post<MessageResponse>('/auth/change-password', data);
    return response.data;
  },

  /**
   * Logout - clear local tokens
   */
  logout: (): void => {
    clearTokens();
  },
};
