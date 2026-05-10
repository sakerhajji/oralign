import { AxiosError } from 'axios';

export function extractApiErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data;
    if (data?.message) {
      if (Array.isArray(data.message)) return data.message[0] ?? 'An error occurred';
      if (typeof data.message === 'string') return data.message;
    }
    const status = error.response?.status;
    if (status === 401) return 'You are not authenticated. Please log in again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'The requested resource was not found.';
    if (status === 409) return 'A conflict occurred. This record may already exist.';
    if (status === 422) return 'Validation failed. Please check your input.';
    if (status && status >= 500) return 'Server error. Please try again later.';
    if (error.message === 'Network Error') return 'Network error. Please check your connection.';
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
