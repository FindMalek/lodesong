import { Button } from "@lodesong/ui/components/button";
import { Input } from "@lodesong/ui/components/input";
import { Switch } from "@lodesong/ui/components/switch";
import { CopyIcon, UsersIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Content, EmptyState, PageHeader, Section } from "@/components/library";
import { PageSkeleton } from "@/components/skeletons";
import { listen, useListen } from "@/lib/listen";
import { HEADERS } from "@/lib/subsonic";
import type { Song } from "@/lib/types";

async function searchSongs(text: string): Promise<Song[]> {
  const response = await fetch(`/api/search?${new URLSearchParams({ q: text, limit: "6" })}`, { headers: HEADERS });
  if (!response.ok) return [];
  return ((await response.json()) as { songs: Song[] }).songs;
}

/** A listener's way to put a song on the host's queue. */
function AddSong() {
  const [text, setText] = useState("");
  const [found, setFound] = useState<Song[]>([]);
  const latest = useRef("");
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <Input
        aria-label="search the library to add a song"
        placeholder="add a song to the queue"
        value={text}
        onChange={(event) => {
          const asked = event.target.value;
          setText(asked);
          latest.current = asked;
          if (asked.trim().length < 2) return setFound([]);
          void searchSongs(asked).then((songs) => {
            if (latest.current === asked) setFound(songs);
          });
        }}
      />
      {found.map((song) => (
        <Button
          key={song.id}
          variant="outline"
          size="xs"
          className="justify-start font-normal"
          onClick={() => {
            listen.add(song);
            setText("");
            setFound([]);
          }}
        >
          <span className="truncate">
            {song.title} · {song.artist}
          </span>
        </Button>
      ))}
    </div>
  );
}

const SKIP_HELP = "when on, every listener can skip songs. when off, only you can.";
const PARTY_HELP =
  "when on, only your device plays audio and everyone else just controls it. when off, everyone hears it on their own device.";

/** A labelled switch with a one-line description and its state spelled out. */
function Toggle({
  id,
  label,
  help,
  checked,
  name,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  name: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Switch
        id={id}
        aria-label={name}
        aria-describedby={`${id}-help`}
        checked={checked}
        onCheckedChange={(on) => onChange(on === true)}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="flex items-center gap-2">
          {label}
          <span className="font-mono text-muted-foreground text-xs">{checked ? "on" : "off"}</span>
        </label>
        <p id={`${id}-help`} className="text-muted-foreground text-xs">
          {help}
        </p>
      </div>
    </div>
  );
}

/** `/listen` starts or ends a session; `/listen/<code>` joins one. */
export function ListenPage({ code }: { code: string | null }) {
  const session = useListen();
  const [joinCode, setJoinCode] = useState("");
  const [anyoneCanSkip, setAnyoneCanSkip] = useState(false);
  const [partyMode, setPartyMode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Opening a shared link joins it (once).
  useEffect(() => {
    if (code && listen.getState().status === "off") listen.join(code);
  }, [code]);

  const link = session.code ? `${location.origin}/listen/${session.code}` : "";
  const connected = session.status === "host" || session.status === "listener";
  return (
    <>
      <PageHeader title="listen together" meta={connected ? `${session.members.length} listening` : undefined} />
      <Content>
        {session.status === "ended" ? (
          <EmptyState>the host ended the session</EmptyState>
        ) : session.status === "failed" ? (
          <EmptyState>couldn't connect · the session may be over</EmptyState>
        ) : session.status === "connecting" ? (
          <PageSkeleton />
        ) : connected ? (
          <div className="flex max-w-xl flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {session.status === "host"
                ? "you're the host: whatever you play, everyone here hears in sync."
                : "you're following the host: playback matches theirs. leave to play your own music again."}
            </p>
            {session.status === "host" && (
              <div className="flex items-center gap-2">
                <Input readOnly aria-label="session link" value={link} className="font-mono" onFocus={(event) => event.target.select()} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link);
                    setCopied(true);
                  }}
                >
                  <CopyIcon />
                  {copied ? "copied" : "copy"}
                </Button>
              </div>
            )}
            {session.status === "host" && (
              <>
                <Toggle
                  id="skip-live"
                  name="anyone can skip"
                  label="anyone can skip"
                  help={SKIP_HELP}
                  checked={session.anyoneCanSkip}
                  onChange={(on) => listen.setAnyoneCanSkip(on)}
                />
                <Toggle
                  id="party-live"
                  name="party mode"
                  label="party mode"
                  help={PARTY_HELP}
                  checked={session.partyMode}
                  onChange={(on) => listen.setPartyMode(on)}
                />
              </>
            )}
            {session.status === "listener" && session.partyMode && (
              <p className="font-mono text-muted-foreground text-xs">the host's device plays the audio. your controls are sent to it.</p>
            )}
            {session.status === "listener" && (
              <div className="flex flex-col gap-3">
                <AddSong />
                {session.anyoneCanSkip && (
                  <Button variant="outline" size="sm" className="w-fit" onClick={() => listen.skip()}>
                    skip
                  </Button>
                )}
              </div>
            )}
            <ul aria-label="listeners" className="flex flex-col gap-1 font-mono text-sm">
              {session.members.map((member) => (
                <li key={member.user} className="flex items-center gap-2">
                  <UsersIcon className="size-3.5 text-muted-foreground" />
                  {member.user}
                  {member.host && <span className="text-muted-foreground">host</span>}
                </li>
              ))}
            </ul>
            {session.notes.length > 0 && (
              <ul aria-label="activity" className="flex flex-col gap-0.5 font-mono text-muted-foreground text-xs">
                {session.notes.map((text, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a short append-only log
                  <li key={`${index}-${text}`}>{text}</li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => listen.leave()}>
              {session.status === "host" ? "end session" : "leave"}
            </Button>
          </div>
        ) : (
          <div className="flex max-w-md flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              play music together with people on this server. start a session and share its link: they sign in with their own account and
              hear what you play.
            </p>
            <Toggle
              id="skip-new"
              name="anyone can skip before starting"
              label="anyone can skip"
              help={SKIP_HELP}
              checked={anyoneCanSkip}
              onChange={setAnyoneCanSkip}
            />
            <Toggle
              id="party-new"
              name="party mode before starting"
              label="party mode"
              help={PARTY_HELP}
              checked={partyMode}
              onChange={setPartyMode}
            />
            <Button className="w-fit" onClick={() => void listen.host(anyoneCanSkip, partyMode)}>
              start a session
            </Button>
          </div>
        )}
      </Content>
      {!connected && session.status !== "connecting" && (
        <Section title="join a session">
          <form
            className="flex max-w-md items-center gap-2 pb-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (joinCode.trim()) listen.join(joinCode.trim().toLowerCase());
            }}
          >
            <Input
              aria-label="session code"
              className="font-mono"
              placeholder="session code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
            />
            <Button type="submit" variant="outline">
              join
            </Button>
          </form>
        </Section>
      )}
    </>
  );
}
