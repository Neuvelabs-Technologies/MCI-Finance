import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/common/StateViews';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="This page doesn’t exist"
      description="The link may be out of date, or the page may have moved."
      action={
        <Button asChild variant="secondary">
          <Link to="/admin">Back to overview</Link>
        </Button>
      }
    />
  );
}
