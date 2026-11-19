import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col rounded-[10px] border border-border bg-card text-card-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-5 md:p-6', className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('font-display font-bold leading-snug', className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CardAction({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('self-start justify-self-end', className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-5 pb-5 md:px-6 md:pb-6', className)}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-5 pb-5 md:px-6 md:pb-6', className)}
      {...props}
    />
  );
}
