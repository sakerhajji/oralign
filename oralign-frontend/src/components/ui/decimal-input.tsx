"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"

type DecimalInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value: number
  onValueChange: (value: number) => void
  /** Digits allowed after the separator (TND amounts use 3). */
  fractionDigits?: number
}

/**
 * Free-typing decimal amount — a plain text input (no number spinner),
 * accepting "12.5" or "12,5". Intermediate states like "12." keep the
 * caret; the parent only ever receives a valid non-negative number.
 */
function DecimalInput({
  value,
  onValueChange,
  fractionDigits = 3,
  onBlur,
  ...props
}: DecimalInputProps) {
  const [text, setText] = React.useState(() => String(value))
  const lastParsed = React.useRef(value)
  const pattern = React.useMemo(
    () => new RegExp(`^\\d*\\.?\\d{0,${fractionDigits}}$`),
    [fractionDigits]
  )

  React.useEffect(() => {
    // Re-sync only on external changes (form hydration/reset) so typing
    // "12." is not rewritten to "12" under the caret.
    if (value !== lastParsed.current) {
      lastParsed.current = value
      setText(String(value))
    }
  }, [value])

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const typed = e.target.value
        const normalized = typed.replace(",", ".")
        if (!pattern.test(normalized)) return
        setText(typed)
        const parsed =
          normalized === "" || normalized === "." ? 0 : Number(normalized)
        lastParsed.current = parsed
        onValueChange(parsed)
      }}
      onBlur={(e) => {
        // Tidy the display once editing is done ("12." → "12", "" → "0").
        setText(String(lastParsed.current))
        onBlur?.(e)
      }}
    />
  )
}

export { DecimalInput }
