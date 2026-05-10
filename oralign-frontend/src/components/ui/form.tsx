'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export function Form({ className, ...props }: React.ComponentProps<'form'>) {
  return <form className={cn('space-y-4', className)} {...props} />;
}
