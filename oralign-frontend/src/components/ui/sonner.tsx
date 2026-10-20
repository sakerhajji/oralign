"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"

/**
 * The one Toaster, mounted in the root layout.
 *
 * Anchored at the TOP (top-right on desktop, top-center on phones) so a
 * toast can never sit on a bottom action bar — the order wizard's
 * Retour / Enregistrer / Continuer row used to disappear under them.
 * Lifetimes and de-duplication live in lib/toast.ts; the visual design in
 * globals.css under `[data-sonner-toaster]`.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const isMobile = useIsMobile()

  return (
    <Sonner
      position={isMobile ? "top-center" : "top-right"}
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Every toast gets an explicit close control: a doctor mid-form
      // should not have to wait for a card to fade on its own.
      closeButton
      // Three at most, then the oldest collapses — a burst of saves must
      // not wall off the top of a phone screen.
      visibleToasts={3}
      gap={8}
      // Clear of the notch and the browser chrome on phones; the desktop
      // offset keeps the stack off the window edge.
      offset={{ top: 16, right: 16 }}
      mobileOffset={{
        top: "max(12px, env(safe-area-inset-top))",
        left: "max(12px, env(safe-area-inset-left))",
        right: "max(12px, env(safe-area-inset-right))",
      }}
      swipeDirections={isMobile ? ["top", "left", "right"] : ["right"]}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
