/** How long the print frame stays around: the print dialog may stay open a while. */
const FRAME_LIFETIME_MS = 10 * 60_000;

let lastFrame: { frame: HTMLIFrameElement; url: string; timer: number } | null = null;

function dispose(): void {
  if (!lastFrame) return;
  window.clearTimeout(lastFrame.timer);
  lastFrame.frame.remove();
  URL.revokeObjectURL(lastFrame.url);
  lastFrame = null;
}

/**
 * Print a PDF the app fetched (a blob behind the JWT): it loads in an
 * off-screen frame and the browser's print dialog opens on it, without a
 * new tab or a pop-up blocker in the way. Where a browser cannot print a
 * framed PDF, the PDF opens in a new tab instead, ready to print from its
 * viewer. One frame at a time: a new print replaces the previous one.
 */
export function printPdf(blob: Blob): void {
  dispose();
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Not display:none nor 0×0: Chrome does not load its PDF viewer there.
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    border: '0',
  });
  const fallback = () => {
    window.open(url, '_blank', 'noopener');
  };
  frame.onload = () => {
    try {
      const view = frame.contentWindow;
      if (!view) throw new Error('No frame window');
      view.focus();
      view.print();
    } catch {
      fallback();
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
  lastFrame = { frame, url, timer: window.setTimeout(dispose, FRAME_LIFETIME_MS) };
}
