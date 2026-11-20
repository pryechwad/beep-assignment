import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function NotFound() {
  return (
    <EmptyState icon={Compass} title="This page doesn’t exist" action={<Button asChild size="sm"><Link to="/jobs">Browse opportunities</Link></Button>}>
      The link may be outdated. The job explorer has every active posting.
    </EmptyState>
  );
}
