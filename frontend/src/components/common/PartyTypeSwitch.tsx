import { Truck, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/menu';
import type { PartyType } from '@/types';

/** Customers / Vendors toggle, for pages that show one of the two at a time. */
export function PartyTypeSwitch({ value, onChange, label = 'Show' }: { value: PartyType; onChange: (t: PartyType) => void; label?: string }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v === 'vendor' ? 'vendor' : 'customer')}>
      <TabsList variant="default" aria-label={label}>
        <TabsTrigger value="customer">
          <Users aria-hidden /> Customers
        </TabsTrigger>
        <TabsTrigger value="vendor">
          <Truck aria-hidden /> Vendors
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
