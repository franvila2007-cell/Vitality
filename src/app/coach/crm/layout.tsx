import CrmTabs from '@/components/crm/CrmTabs';
import { CrmAddContactButton } from '@/components/crm/CrmActions';

// Shell for the CRM section of the coach app. Coach-role guard lives in
// coach/layout.tsx; the CRM tables are coach-only via RLS too.
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 page-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-h1 font-semibold">CRM</h1>
          <p className="text-2xs text-neutral-400">Every lead, funnel and client in one place</p>
        </div>
        <CrmAddContactButton />
      </div>
      <div className="mb-5"><CrmTabs /></div>
      {children}
    </div>
  );
}
