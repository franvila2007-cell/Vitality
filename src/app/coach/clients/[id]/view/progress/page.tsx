import ProgressClient from '@/components/ProgressClient';

export default async function ClientProgressPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProgressClient userId={id} readOnly />;
}
