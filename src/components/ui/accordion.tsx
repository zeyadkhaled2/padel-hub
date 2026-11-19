'use client';

import type * as React from 'react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

export function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('border-b border-border last:border-b-0', className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group flex min-h-[56px] flex-1 items-center justify-between gap-4 py-4 text-start font-display text-[16px] sm:text-[17px] font-bold text-foreground transition-colors outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      >
        <span>{children}</span>
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-all duration-200 group-hover:text-brand group-data-[state=open]:rotate-45 group-data-[state=open]:bg-primary group-data-[state=open]:text-primary-foreground"
          aria-hidden="true"
        >
          <Plus size={15} />
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-[14.5px] sm:text-[15px] leading-[1.65] text-muted-foreground data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn('pb-5 pe-8 pt-0', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
