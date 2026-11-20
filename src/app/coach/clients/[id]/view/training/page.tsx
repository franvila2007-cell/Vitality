import TrainingClient from '@/components/training/TrainingClient';

export default async function ClientTrainingPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrainingClient userId={id} readOnly />;
}
