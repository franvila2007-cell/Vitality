import CrmTabs from '@/components/crm/CrmTabs';
import { CrmAddContactButton } from '@/components/crm/CrmActions';

// Shell for the CRM section of the coach app. Coach-role guard lives in
// coach/layout.tsx; the CRM tables are coach-only via RLS too.
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <div className="flex justify-end mb-3">
        <CrmAddContactButton />
      </div>
      <div className="mb-5"><CrmTabs /></div>
      {children}
    </div>
  );
}
