"use client";

import { useEffect, useState } from "react";
import { DEFAULT_VIDEO_ID } from "@/shared/jam";
import ChatPanel from "./ChatPanel";
import PlayerBar from "./PlayerBar";
import RoomHeader from "./RoomHeader";
import RoomSidebar from "./RoomSidebar";
import RoomChatDialog from "./RoomChatDialog";
import RoomInfoDialog from "./RoomInfoDialog";
import RoomEndedNotice from "./RoomEndedNotice";
import RoomConnectionNotice from "./RoomConnectionNotice";
import TrackWorkspace from "./TrackWorkspace";
import { useJamRoomSession } from "./hooks/useJamRoomSession";
import { useJamRoomControls } from "./hooks/useJamRoomControls";

type JamRoomProps = {
  code: string;
};

export default function JamRoom({ code }: JamRoomProps) {
  const session = useJamRoomSession(code);
  const controls = useJamRoomControls(session.sendControl, session.isHost);
  const [clockMs, setClockMs] = useState(0);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isRoomInfoOpen, setIsRoomInfoOpen] = useState(false);
  const [isVideoFullscreenFallback, setIsVideoFullscreenFallback] = useState(false);
  const playback = session.room?.playback;
  const isPlaying = playback?.status === "playing";
  const positionSeconds = playback
    ? playback.positionSeconds +
      (playback.status === "playing" && playback.startsAtMs !== null
        ? Math.max(0, clockMs + session.serverClockOffsetMs - playback.startsAtMs) / 1_000
        : 0)
    : 0;

  useEffect(() => {
    const interval = window.setInterval(() => setClockMs(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={`grid h-dvh grid-rows-[48px_minmax(0,1fr)_80px] bg-[#0b0b0b] ${isVideoFullscreenFallback ? "overflow-visible" : "overflow-hidden"}`}>
      <RoomHeader
        connectionStatus={session.connectionStatus}
        onOpenChat={() => setIsChatOpen(true)}
        onOpenRoomInfo={() => setIsRoomInfoOpen(true)}
        isHost={session.isHost}
        onEndJam={session.leaveRoom}
      />

      <div className="relative grid min-h-0 min-w-0 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <div className="hidden min-h-0 lg:block">
          <RoomSidebar
            code={code}
            participants={session.room?.participants ?? []}
            selfParticipantId={session.selfParticipantId}
          />
        </div>

        <TrackWorkspace
          playback={playback ?? {
            status: "idle",
            mediaType: "video",
            trackId: DEFAULT_VIDEO_ID,
            positionSeconds: 0,
            startsAtMs: null,
          }}
          serverClockOffsetMs={session.serverClockOffsetMs}
          onDurationChange={setVideoDurationSeconds}
          isHost={session.isHost}
          queue={session.room?.queue ?? []}
          onMediaTypeChange={controls.setMediaType}
          onAddToQueue={controls.addToQueue}
          onMoveQueueItem={controls.moveQueueItem}
          onRemoveQueueItem={controls.removeQueueItem}
          onPlayQueueItem={controls.playQueueItem}
          onTrackEnded={session.isHost ? controls.onTrackEnded : undefined}
          isFullscreenFallback={isVideoFullscreenFallback}
          onFullscreenFallbackChange={setIsVideoFullscreenFallback}
        />

        <div className="hidden min-h-0 2xl:block">
          <ChatPanel
            messages={session.room?.messages ?? []}
            selfParticipantId={session.selfParticipantId}
            disabled={session.connectionStatus !== "connected"}
            onSendMessage={session.sendChatMessage}
          />
        </div>

        <RoomChatDialog
          open={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={session.room?.messages ?? []}
          selfParticipantId={session.selfParticipantId}
          disabled={session.connectionStatus !== "connected"}
          onSendMessage={session.sendChatMessage}
        />
        <RoomInfoDialog
          open={isRoomInfoOpen}
          onClose={() => setIsRoomInfoOpen(false)}
          code={code}
          participants={session.room?.participants ?? []}
          selfParticipantId={session.selfParticipantId}
        />
      </div>

      <PlayerBar
        trackSelected={Boolean(playback?.trackId)}
        isPlaying={Boolean(isPlaying)}
        isHost={session.isHost}
        positionSeconds={positionSeconds}
        durationSeconds={videoDurationSeconds}
        onTogglePlayback={() => controls.togglePlayback(Boolean(isPlaying))}
      />

      {session.roomEnded
        ? <RoomEndedNotice secondsRemaining={session.redirectSeconds} />
        : <RoomConnectionNotice connectionStatus={session.connectionStatus} errorMessage={session.errorMessage} />}
    </div>
  );
}
