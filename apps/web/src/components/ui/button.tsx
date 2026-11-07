import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] text-[length:var(--text-sm)] font-semibold transition-all disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
  {
    variants: {
      variant: {
        default: 'btn-primary bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'btn-secondary bg-surface text-foreground border border-border hover:bg-surface-2 hover:border-border-strong',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-surface-2 hover:border-border-strong',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-surface-2',
        destructive: 'btn-danger bg-destructive text-destructive-foreground hover:opacity-90',
        link: 'border-transparent bg-transparent text-primary-ink underline underline-offset-4 hover:opacity-85',
      },
      size: {
        default: 'min-h-[36px] px-4 py-1.5',
        sm: 'min-h-[32px] px-3 py-1 text-[length:var(--text-xs)]',
        lg: 'min-h-[42px] px-5 py-2 text-[length:var(--text-md)]',
        icon: 'h-[38px] w-[38px] p-0',
      },
      fullWidth: {
        true: 'btn-block w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

