import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons on the right: the main one solid, the rest outline. */
  actions?: ReactNode;
  back?: { to: string; label: string };
  eyebrow?: ReactNode;
  /** Status badges shown under the title. */
  badges?: ReactNode;
}

/** The top of every admin page. */
export function PageHeader({ title, subtitle, actions, back, eyebrow, badges }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {back ? (
        <Link
          to={back.to}
          className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow ? <p className="text-sm font-semibold text-muted-foreground">{eyebrow}</p> : null}
          <h1 className="border-l-[3px] border-primary pl-3 text-2xl font-bold leading-tight text-foreground md:text-[1.75rem]">{title}</h1>
          {subtitle ? <p className="max-w-3xl pl-[15px] text-base text-muted-foreground">{subtitle}</p> : null}
          {badges ? <div className="flex flex-wrap items-center gap-2 pl-[15px] pt-1">{badges}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
