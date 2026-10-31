type RoomEndedNoticeProps = {
  secondsRemaining: number;
};

export default function RoomEndedNotice({ secondsRemaining }: RoomEndedNoticeProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b0b0b]/95 px-6 text-center" role="alertdialog" aria-modal="true" aria-labelledby="room-ended-title">
      <div className="max-w-sm">
        <h1 id="room-ended-title" className="text-xl font-semibold text-white">The host ended this Jam</h1>
        <p className="mt-2 text-sm text-neutral-400">Returning to the home page in {secondsRemaining} seconds.</p>
      </div>
    </div>
  );
}
