import { toast as sonner, type ExternalToast } from 'sonner';

/**
 * The app's `toast`. Same API as sonner's — this module is a drop-in for
 * sonner's own `toast` import — with two behaviours every call site
 * gets for free:
 *
 *   • Lifetime by kind. A success is a receipt: three seconds and gone.
 *     An error must be read and acted on, so it stays longer; a warning
 *     sits in between. Loading toasts keep sonner's "until dismissed".
 *
 *   • No duplicates. A toast whose message is already on screen is
 *     refreshed in place rather than stacked — saving a form twice, or a
 *     retry that fails with the same error, never piles up cards. The id
 *     is derived from the kind and the text, so a caller-supplied `id`
 *     still wins (loading → success hand-offs rely on that).
 *
 * The Toaster itself (position, close button, styling) is configured in
 * components/ui/sonner.tsx.
 */

const DURATION: Record<'success' | 'info' | 'warning' | 'error' | 'message', number> = {
  success: 3_000,
  message: 3_500,
  info: 3_500,
  warning: 5_000,
  error: 6_000,
};

type Message = Parameters<typeof sonner.success>[0];

function dedupeId(kind: string, message: Message): string | undefined {
  return typeof message === 'string' ? `${kind}:${message}` : undefined;
}

function withDefaults(
  kind: keyof typeof DURATION,
  message: Message,
  data?: ExternalToast,
): ExternalToast {
  const id = data?.id ?? dedupeId(kind, message);
  return {
    duration: DURATION[kind],
    ...(id !== undefined ? { id } : {}),
    ...data,
  };
}

const base = (message: Message, data?: ExternalToast) =>
  sonner(message, withDefaults('message', message, data));

/** sonner's `toast`, with the app's lifetimes and de-duplication. */
export const toast: typeof sonner = Object.assign(base, sonner, {
  success: (message: Message, data?: ExternalToast) =>
    sonner.success(message, withDefaults('success', message, data)),
  info: (message: Message, data?: ExternalToast) =>
    sonner.info(message, withDefaults('info', message, data)),
  warning: (message: Message, data?: ExternalToast) =>
    sonner.warning(message, withDefaults('warning', message, data)),
  error: (message: Message, data?: ExternalToast) =>
    sonner.error(message, withDefaults('error', message, data)),
  message: (message: Message, data?: ExternalToast) =>
    sonner.message(message, withDefaults('message', message, data)),
});
