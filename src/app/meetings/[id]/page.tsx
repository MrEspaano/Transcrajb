import { MeetingWorkspace } from "@/components/meeting-workspace";

export const dynamic = "force-dynamic";

interface MeetingPageProps {
  params: {
    id: string;
  };
}

export default function MeetingPage({ params }: MeetingPageProps): JSX.Element {
  return (
    <main className="page-shell">
      <MeetingWorkspace meetingId={params.id} />
    </main>
  );
}
