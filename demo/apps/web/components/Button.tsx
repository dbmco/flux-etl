import React from 'react';
import { clsx } from 'clsx';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  const base = 'px-4 py-2 rounded font-medium';
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300'
  } as const;

  return <button className={clsx(base, variants[variant], className)} {...props} />;
}
