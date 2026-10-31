import { Suspense } from "react";
import JamRoom from "@/components/jam/JamRoom";

type PageProps = {
  params: Promise<{
    code: string;
  }>;
};

async function RoomContent({ params }: PageProps) {
  const { code } = await params;

  return <JamRoom code={code} />;
}

export default function JamPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-neutral-950 text-neutral-400">
          Loading jam room…
        </main>
      }
    >
      <RoomContent params={params} />
    </Suspense>
  );
}