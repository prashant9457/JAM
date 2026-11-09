"use client";

import { useEffect, useState } from "react";
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
import { getMusicTrack } from "@/shared/music";

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
  const [isVideoFullscreenFallback, setIsVideoFullscreenFallback] =
    useState(false);
  const [isPlayerPrepared, setIsPlayerPrepared] = useState(false);
  const playback = session.room?.playback;
  const isPlaying = playback?.status === "playing";
  const positionSeconds = playback
    ? playback.positionSeconds +
      (playback.status === "playing" && playback.startsAtMs !== null
        ? Math.max(
            0,
            clockMs + session.serverClockOffsetMs - playback.startsAtMs,
          ) / 1_000
        : 0)
    : 0;
  const isPreparing =
    session.connectionStatus !== "connected" ||
    !session.isClockSynced ||
    (Boolean(playback?.trackId) && !isPlayerPrepared);

  function handlePlayerPrepared() {
    setIsPlayerPrepared(true);
  }

  useEffect(() => {
    const interval = window.setInterval(() => setClockMs(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div
      className={`grid h-dvh grid-rows-[48px_minmax(0,1fr)_80px] bg-[#0b0b0b] ${isVideoFullscreenFallback ? "overflow-visible" : "overflow-hidden"}`}
    >
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
          playback={
            playback ?? {
              status: "idle",
              mediaType: "video",
              trackId: null,
              positionSeconds: 0,
              startsAtMs: null,
            }
          }
          serverClockOffsetMs={session.serverClockOffsetMs}
          clockRoundTripMs={session.clockRoundTripMs}
          isClockSynced={
            session.isClockSynced &&
            session.connectionStatus === "connected" &&
            !session.roomEnded
          }
          onPlayMusic={controls.playMusic}
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
          isSyncing={Boolean(session.room?.sync)}
          onPlaybackReady={session.reportPlaybackReady}
          readyCount={session.room?.sync?.readyParticipantIds.length ?? 0}
          isPlaybackReady={Boolean(
            session.selfParticipantId &&
            session.room?.sync?.readyParticipantIds.includes(
              session.selfParticipantId,
            ),
          )}
          participantCount={session.room?.participants.length ?? 0}
          isPreparing={isPreparing}
          onPreparationReady={handlePlayerPrepared}
          onPreparationError={handlePlayerPrepared}
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
        title={
          playback?.mediaType === "music"
            ? (getMusicTrack(playback.trackId)?.title ?? "Shared music")
            : "Shared video"
        }
        mediaType={playback?.mediaType ?? "video"}
        trackSelected={Boolean(playback?.trackId)}
        isPlaying={Boolean(isPlaying)}
        isSyncing={Boolean(session.room?.sync)}
        isHost={session.isHost}
        positionSeconds={positionSeconds}
        durationSeconds={videoDurationSeconds}
        onTogglePlayback={() => controls.togglePlayback(Boolean(isPlaying))}
      />

      {session.roomEnded ? (
        <RoomEndedNotice secondsRemaining={session.redirectSeconds} />
      ) : (
        <RoomConnectionNotice
          connectionStatus={session.connectionStatus}
          errorMessage={session.errorMessage}
        />
      )}
    </div>
  );
}
