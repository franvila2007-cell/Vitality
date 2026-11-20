import { redirect } from 'next/navigation';

// Milestones became Training; the milestone timeline and the Academy now live
// in Progress. Old links land on Training.
export default function MilestonesPage() {
  redirect('/training');
}
