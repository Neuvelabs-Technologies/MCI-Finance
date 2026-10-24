import type { CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

/** Short confirmations ("Invite sent") at the bottom of the screen. Call `toast()` from 'sonner'. */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      closeButton
      richColors
      icons={{
        success: <CircleCheck className="size-5" />,
        info: <Info className="size-5" />,
        warning: <TriangleAlert className="size-5" />,
        error: <OctagonX className="size-5" />,
        loading: <Loader2 className="size-5 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--success-soft)',
          '--success-text': 'var(--success)',
          '--success-border': 'transparent',
          '--error-bg': 'var(--danger-soft)',
          '--error-text': 'var(--danger)',
          '--error-border': 'transparent',
          '--warning-bg': 'var(--warning-soft)',
          '--warning-text': 'var(--warning)',
          '--warning-border': 'transparent',
          '--info-bg': 'var(--info-soft)',
          '--info-text': 'var(--info)',
          '--info-border': 'transparent',
          '--border-radius': '0.875rem',
          fontFamily: 'inherit',
        } as CSSProperties
      }
      toastOptions={{ style: { fontSize: '0.9375rem', fontWeight: 600, padding: '14px 16px' } }}
    />
  );
}
