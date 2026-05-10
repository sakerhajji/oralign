'use client';

import { useMemo, useState } from 'react';
import { Check, Info, Palette, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToothInstruction, ToothInstructionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const upperTeeth = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const lowerTeeth = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const instructionOptions = [
  {
    type: ToothInstructionType.NO_ATTACHMENTS,
    label: 'No Attachments',
    short: 'NA',
    colorClass: 'bg-indigo-700',
    toothClass: 'bg-indigo-700/75',
  },
  {
    type: ToothInstructionType.DO_NOT_MOVE,
    label: 'Do Not Move',
    short: 'DNM',
    colorClass: 'bg-red-600',
    toothClass: 'bg-red-600/75',
  },
  {
    type: ToothInstructionType.NO_IPR,
    label: 'No IPR',
    short: 'No IPR',
    colorClass: 'bg-green-700',
    toothClass: 'bg-green-700/75',
  },
] as const;

export function OdontogramSelector({
  value,
  onChange,
  disabled,
}: {
  value: ToothInstruction[];
  onChange: (value: ToothInstruction[]) => void;
  disabled?: boolean;
}) {
  const [selectedTooth, setSelectedTooth] = useState<number>(11);
  const [showLegend, setShowLegend] = useState(true);

  const selectedInstructions = useMemo(
    () => value.filter((item) => item.toothNumber === selectedTooth),
    [selectedTooth, value],
  );

  const toggleInstruction = (toothNumber: number, type: ToothInstructionType) => {
    const exists = value.some(
      (item) => item.toothNumber === toothNumber && item.type === type,
    );

    if (exists) {
      onChange(
        value.filter(
          (item) => !(item.toothNumber === toothNumber && item.type === type),
        ),
      );
      return;
    }

    onChange([...value, { toothNumber, type }]);
  };

  const clearTooth = (toothNumber: number) => {
    onChange(value.filter((item) => item.toothNumber !== toothNumber));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Odontogram</h2>
          <p className="text-sm text-muted-foreground">
            Click any tooth, then apply one or more instruction colors.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="justify-start text-primary"
          onClick={() => setShowLegend((current) => !current)}
        >
          <Palette className="mr-2 h-4 w-4" />
          View Color Legend
        </Button>
      </div>

      {showLegend && <ColorLegend value={value} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-x-auto rounded-md border bg-background p-4">
          <div className="min-w-[880px]">
            <ToothRow
              teeth={upperTeeth}
              arch="upper"
              value={value}
              selectedTooth={selectedTooth}
              disabled={disabled}
              onSelect={setSelectedTooth}
            />
            <div className="relative my-2 h-px bg-border">
              <span className="absolute left-1/2 top-1/2 h-10 w-px -translate-y-1/2 bg-border" />
            </div>
            <ToothRow
              teeth={lowerTeeth}
              arch="lower"
              value={value}
              selectedTooth={selectedTooth}
              disabled={disabled}
              onSelect={setSelectedTooth}
            />
          </div>
        </div>

        <div className="rounded-md border bg-muted/20 p-4">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">Selected tooth</p>
            <p className="text-3xl font-bold text-foreground">{selectedTooth}</p>
          </div>

          <div className="space-y-2">
            {instructionOptions.map((option) => {
              const active = selectedInstructions.some(
                (item) => item.type === option.type,
              );

              return (
                <button
                  key={option.type}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleInstruction(selectedTooth, option.type)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-md border bg-background px-3 py-3 text-left transition hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-60',
                    active && 'border-primary bg-primary/5',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        'grid h-8 w-8 place-items-center rounded-full border-2 border-background shadow-sm',
                        option.colorClass,
                      )}
                    >
                      {active && <Check className="h-4 w-4 text-white" />}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">
                        {option.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Apply this color to tooth {selectedTooth}
                      </span>
                    </span>
                  </span>
                  {active && <Badge variant="secondary">Applied</Badge>}
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            disabled={disabled || selectedInstructions.length === 0}
            onClick={() => clearTooth(selectedTooth)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear selected tooth
          </Button>
        </div>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((instruction) => (
            <Badge
              key={`${instruction.toothNumber}-${instruction.type}`}
              variant="secondary"
              className="gap-1.5 rounded-full px-3 py-1"
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  optionFor(instruction.type)?.colorClass,
                )}
              />
              <span>Tooth {instruction.toothNumber}</span>
              <span className="text-muted-foreground">
                {optionFor(instruction.type)?.label}
              </span>
            </Badge>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <Info className="h-4 w-4" />
          No tooth-level colors selected yet.
        </div>
      )}
    </div>
  );
}

function ColorLegend({ value }: { value: ToothInstruction[] }) {
  return (
    <div className="grid gap-3 rounded-md border bg-background p-4 sm:grid-cols-3">
      {instructionOptions.map((option) => {
        const teeth = value
          .filter((item) => item.type === option.type)
          .map((item) => item.toothNumber)
          .sort((a, b) => a - b);

        return (
          <div key={option.type} className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 h-6 w-6 rounded-full border-2 border-background shadow-sm',
                option.colorClass,
              )}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{option.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {teeth.length > 0 ? teeth.join(', ') : 'No teeth selected'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToothRow({
  teeth,
  arch,
  value,
  selectedTooth,
  disabled,
  onSelect,
}: {
  teeth: number[];
  arch: 'upper' | 'lower';
  value: ToothInstruction[];
  selectedTooth: number;
  disabled?: boolean;
  onSelect: (tooth: number) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-2">
      {teeth.map((tooth) => {
        const selected = value.filter((item) => item.toothNumber === tooth);
        const active = tooth === selectedTooth;

        return (
          <button
            key={tooth}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(tooth)}
            className={cn(
              'group grid min-h-24 justify-items-center rounded-md border border-transparent px-1 py-2 transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60',
              active && 'border-primary bg-primary/5 shadow-sm',
            )}
          >
            {arch === 'upper' && (
              <ToothGlyph arch={arch} active={active} selected={selected} />
            )}
            <span className="mt-1 text-xs font-bold text-foreground">{tooth}</span>
            {arch === 'lower' && (
              <ToothGlyph arch={arch} active={active} selected={selected} />
            )}
            <span className="mt-1 flex h-4 gap-0.5">
              {selected.map((instruction) => (
                <span
                  key={instruction.type}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    optionFor(instruction.type)?.colorClass,
                  )}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ToothGlyph({
  arch,
  active,
  selected,
}: {
  arch: 'upper' | 'lower';
  active?: boolean;
  selected: ToothInstruction[];
}) {
  const primaryOption = optionFor(selected[0]?.type);

  return (
    <span
      className={cn(
        'relative block h-14 w-8 transition group-hover:scale-105',
        arch === 'lower' && 'rotate-180',
      )}
    >
      <span
        className={cn(
          'absolute left-1/2 top-0 h-11 w-5 -translate-x-1/2 rounded-t-full border bg-background shadow-sm',
          active && 'border-primary',
        )}
      />
      <span
        className={cn(
          'absolute bottom-0 left-1/2 h-7 w-3 -translate-x-1/2 rounded-b-full bg-muted-foreground/35',
          primaryOption?.toothClass,
        )}
      />
      {selected.length > 1 && (
        <span className="absolute left-1/2 top-4 flex -translate-x-1/2 gap-0.5 rounded-full bg-background/90 p-0.5 shadow-sm">
          {selected.slice(0, 3).map((instruction) => (
            <span
              key={instruction.type}
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                optionFor(instruction.type)?.colorClass,
              )}
            />
          ))}
        </span>
      )}
    </span>
  );
}

function optionFor(type?: ToothInstructionType) {
  return instructionOptions.find((option) => option.type === type);
}
