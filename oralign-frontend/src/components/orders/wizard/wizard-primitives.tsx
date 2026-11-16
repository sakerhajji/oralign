'use client';

/**
 * Building blocks shared by the order wizards (the initial order wizard and
 * the supplemental request wizard), so both read as one product: same
 * stepper, step header, panels, question cards and choice controls.
 *
 * Every primitive is copy-agnostic: callers pass already-translated strings,
 * which keeps this module free of dictionary keys. Optional accessibility
 * props (`id`, `aria-*`, `radio`) default to "absent", so a caller that does
 * not pass them gets exactly the markup the order wizard always rendered.
 */

import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/** Border of a selected choice (cards, pills, tiles). */
export const BRAND_ACTIVE_BORDER = 'border-primary';

/** Id of the error line that belongs to the field `fieldId`. */
export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`;
}

// ─── Wizard chrome ─────────────────────────────────────────────────────────

export type WizardStep = {
  /** Stable React key (e.g. the step's dictionary key). */
  key: string;
  /** Translated step title. */
  title: string;
};

export function WizardStepper({
  steps,
  currentStep,
  onStepChange,
  ariaLabel,
  stepLabel,
  ofLabel,
}: {
  steps: readonly WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  /** Accessible name of the step navigation. */
  ariaLabel: string;
  /** "Step" / "Étape": the phone counter and each circle's accessible name. */
  stepLabel: string;
  /** "of" / "sur": the phone counter ("Étape 2 sur 6"). */
  ofLabel: string;
}) {
  const current = steps[currentStep];
  // Total = step count + N-1 progress bars. The progress bars take `flex-1`
  // so they expand to fill whatever width the container provides — the
  // stepper always exactly fits its parent without a horizontal scroll.

  return (
    <nav aria-label={ariaLabel} className="space-y-3">
      {/* Mobile-only context line — shows the title clearly because the
          circles below are too small for inline labels at phone widths. */}
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {stepLabel} {currentStep + 1} {ofLabel} {steps.length}
        </span>
        <span className="truncate text-sm font-semibold text-foreground">
          {current?.title}
        </span>
      </div>

      {/* Step rail — circles stretched evenly across the available width. */}
      <ol
        role="list"
        className="relative flex w-full items-center pb-6 sm:pb-8"
      >
        {steps.map((step, index) => {
          const active = index === currentStep;
          const complete = index < currentStep;
          return (
            <Fragment key={step.key}>
              <li className="relative flex shrink-0 flex-col items-center">
                <button
                  type="button"
                  // Free navigation — every step circle is clickable so the
                  // user can jump back and forth without finishing earlier
                  // steps. The Next button still validates before moving
                  // forward; this is just a quick-jump shortcut.
                  onClick={() => onStepChange(index)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`${stepLabel} ${index + 1}: ${step.title}`}
                  className={cn(
                    'group relative grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:h-9 sm:w-9 sm:text-sm',
                    active &&
                      'scale-110 border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25',
                    complete &&
                      'border-primary bg-primary/10 text-primary hover:bg-primary/20',
                    !active && !complete &&
                      'border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground',
                  )}
                >
                  {complete ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>

                {/* Label — absolutely positioned below the circle so its
                    presence (or absence below sm) doesn't push the
                    connector lines out of alignment. */}
                <span
                  className={cn(
                    'pointer-events-none absolute top-full mt-1.5 hidden whitespace-nowrap text-[11px] font-medium transition-colors sm:block',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.title}
                </span>
              </li>

              {/* Connector — `flex-1` makes it absorb every spare pixel,
                  so seven circles + six connectors always span the row
                  without scroll. Coloured to track completion. */}
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'mx-1 h-0.5 flex-1 rounded-full transition-colors sm:mx-2',
                    complete ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/** Centred icon + heading + hint above the active step. */
export function WizardStepHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <header className="mx-auto max-w-5xl text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h1 className="text-balance text-xl font-bold tracking-tight text-foreground md:text-2xl">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-5xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

/** The raised card that holds the active step's form. */
export function WizardPanel({ children }: { children: ReactNode }) {
  return (
    <main className="rounded-md border bg-card p-4 shadow-[0_12px_35px_rgba(15,23,42,0.12)] md:p-5 lg:p-6">
      {children}
    </main>
  );
}

/** Bottom action bar: Back on the left, the save / next actions on the right. */
export function WizardFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="flex flex-col gap-3 rounded-md border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      {children}
    </footer>
  );
}

// ─── Questions ─────────────────────────────────────────────────────────────

/**
 * Red star for a mandatory question. The star is decorative; `label`
 * ("required" / "obligatoire") is what a screen reader announces.
 */
export function RequiredMark({ label }: { label?: string }) {
  return (
    <>
      <span aria-hidden className="ml-0.5 text-red-600">
        *
      </span>
      {label ? <span className="sr-only">({label})</span> : null}
    </>
  );
}

/**
 * One question of a wizard step: a `<fieldset>` card with its `<legend>`,
 * an optional one-line hint, the controls, then the error line.
 */
export function FieldsetCard({
  legend,
  number,
  required,
  requiredLabel,
  hint,
  error,
  errorId,
  children,
  className,
}: {
  legend: ReactNode;
  /** Question number, rendered as "6." before the legend. */
  number?: number;
  /** Shows the required star. */
  required?: boolean;
  /** Screen-reader word for the star ("required" / "obligatoire"). */
  requiredLabel?: string;
  hint?: ReactNode;
  error?: string;
  /** Id of the error line; the fieldset is described by it while shown. */
  errorId?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    // min-w-0: a fieldset's default min-inline-size is its min-content, so
    // a wide child (the odontogram) would stretch it past its column
    // instead of scrolling inside its own box.
    <fieldset
      className={cn('min-w-0 space-y-3 rounded-lg border bg-card p-4', className)}
      aria-describedby={error && errorId ? errorId : undefined}
    >
      <legend className="px-1 text-sm font-semibold">
        {number !== undefined && (
          <span className="mr-1 tabular-nums text-primary">{number}.</span>
        )}
        {legend}
        {required && <RequiredMark label={requiredLabel} />}
      </legend>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
      <FieldError message={error} id={errorId} />
    </fieldset>
  );
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-red-600">
      {message}
    </p>
  );
}

// ─── Choice controls ───────────────────────────────────────────────────────

export function ChoiceCard({
  active,
  title,
  description,
  onClick,
  disabled,
  radio,
}: {
  active: boolean;
  title: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Expose the card as `role="radio"`; use inside a `role="radiogroup"`. */
  radio?: boolean;
}) {
  return (
    <button
      type="button"
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-12 items-start justify-between gap-3 rounded-md border bg-background px-4 py-3 text-left transition hover:border-primary/70 disabled:cursor-not-allowed disabled:opacity-60',
        active && `${BRAND_ACTIVE_BORDER} shadow-sm`,
      )}
    >
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        {description !== undefined && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {active && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

/**
 * Universal pill-style choice button used by every "pick one" control
 * in the order wizard — Expansion segments, IPR options, treatment-plan
 * stage, A-P relationship, open bite, midline, bite ramps, crossbite,
 * materials, etc. Single source of truth so the form has one look
 * instead of two competing radio aesthetics.
 *
 * When nested inside a parent with role="radiogroup" the pill exposes
 * itself as role="radio" with aria-checked, which gives screen readers
 * the standard radio-button experience (arrow keys to move, space to
 * select). Otherwise it's a plain button.
 */
export function OptionPill({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // `relative` so the absolute-positioned check badge can pin
        // itself to the top-right corner without nudging the label.
        // `pr-9` reserves room for the badge so a long label
        // ("Don't Move 6 - 7 only") never gets clipped by it.
        'group relative inline-flex min-h-11 items-center justify-center rounded-md border bg-background px-3 pr-9 text-sm font-semibold transition',
        'hover:border-primary/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        active && `${BRAND_ACTIVE_BORDER} bg-primary/5 text-primary shadow-sm`,
      )}
    >
      <span className="text-center">{label}</span>
      {/* Selection check badge — same visual the ChoiceCard uses, so
          every radio-style block in the wizard reads identically. */}
      {active && (
        <CheckCircle2
          className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
          aria-hidden
        />
      )}
    </button>
  );
}

/**
 * Checkbox card for "pick several" lists, with the weight of an
 * OptionPill: 44 px tall, same border, hover, focus ring and selected tint.
 */
export function CheckTile({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex min-h-11 w-full items-start gap-3 rounded-md border bg-background px-3 py-2.5 text-left text-sm transition',
        'hover:border-primary/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked && `${BRAND_ACTIVE_BORDER} bg-primary/5 shadow-sm`,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border border-input bg-background transition-colors',
          checked && 'border-primary bg-primary text-primary-foreground',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className={cn('block font-semibold', checked && 'text-primary')}>
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function ToggleTile({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
  id,
}: {
  label: string;
  /** Optional helper line shown beneath the label. */
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Id of the switch; also links the label to it. */
  id?: string;
}) {
  return (
    <div className="flex h-full min-h-16 items-center justify-between gap-3 rounded-md border bg-background px-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

// ─── Text fields ───────────────────────────────────────────────────────────

/**
 * Accessibility wiring shared by the text fields. With an `id`, the label is
 * linked to the control and the error line is named `fieldErrorId(id)`; the
 * control is then described by it and marked invalid while it shows, unless
 * the caller passes its own `aria-describedby` / `aria-invalid`.
 */
type FieldAriaProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

function fieldAria(
  { id, 'aria-describedby': describedBy, 'aria-invalid': invalid }: FieldAriaProps,
  error: string | undefined,
) {
  const errorId = id && error ? fieldErrorId(id) : undefined;
  return {
    errorId,
    control: {
      id,
      'aria-describedby': describedBy ?? errorId,
      'aria-invalid': invalid ?? (errorId ? true : undefined),
    },
  };
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  icon,
  error,
  disabled,
  type = 'text',
  inputMode,
  min,
  max,
  maxLength,
  ...aria
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  error?: string;
  disabled?: boolean;
  type?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
  min?: number;
  max?: number;
  maxLength?: number;
} & FieldAriaProps) {
  const { errorId, control } = fieldAria(aria, error);
  return (
    <div className="grid gap-2">
      <Label htmlFor={control.id}>{label}</Label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        <Input
          {...control}
          type={type}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={inputMode}
          min={min}
          max={max}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          className={cn('h-11', icon && 'pl-10', error && 'border-red-500')}
        />
      </div>
      <FieldError message={error} id={errorId} />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  compact,
  maxLength,
  ...aria
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  compact?: boolean;
  maxLength?: number;
} & FieldAriaProps) {
  const { errorId, control } = fieldAria(aria, error);
  return (
    <div className="grid gap-2">
      <Label htmlFor={control.id}>{label}</Label>
      <textarea
        {...control}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'w-full rounded-md border border-input bg-background px-3 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'min-h-24' : 'min-h-28',
          error && 'border-red-500 focus-visible:ring-red-500',
        )}
      />
      <FieldError message={error} id={errorId} />
    </div>
  );
}

// ─── Review step ───────────────────────────────────────────────────────────

export function ReviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
      </header>
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  );
}

export function ReviewInfo({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  const safeValue =
    typeof value === 'string' && value.trim().length > 0 ? value : '—';
  return (
    // min-w-0 + overflow-wrap: a long unbroken value (a pasted link) wraps
    // instead of widening the grid column past the screen.
    <div className={cn('min-w-0', wide && 'sm:col-span-2 lg:col-span-3')}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
        {safeValue}
      </p>
    </div>
  );
}
