import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function apiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) {
    return normalized;
  }
  return `${API_BASE_URL}${normalized}`;
}

const SLICE_MS = 8000;

type TranscriptEntry = { text: string; ts: number };
type HighlightPair = {
  ts: number;
  childLine: string;
  partnerLine: string;
  context: string;
  tip: string;
};
type EpisodeMeta = { title: string; durationSec: number };
type AnalysisEnvelope = {
  meta?: EpisodeMeta;
  analysis?: { highlightPairs?: HighlightPair[] };
  highlightPairs?: HighlightPair[];
  message?: string;
};
type SuggestedVideo = { title: string; videoId: string; durationSec: number; thumbnail: string };

const FALLBACK_SUGGESTIONS: SuggestedVideo[] = [
  {
    title: "Peppa Pig - Garden Adventures",
    videoId: "0p3GEXdMa34",
    durationSec: 0,
    thumbnail: "https://i.ytimg.com/vi/0p3GEXdMa34/hqdefault.jpg"
  },
  {
    title: "Peppa Pig - Bubble Fun",
    videoId: "ZN8xtv05mPw",
    durationSec: 0,
    thumbnail: "https://i.ytimg.com/vi/ZN8xtv05mPw/hqdefault.jpg"
  },
  {
    title: "Peppa Pig - Dinosaur Day",
    videoId: "wOlwGxptBYY",
    durationSec: 0,
    thumbnail: "https://i.ytimg.com/vi/wOlwGxptBYY/hqdefault.jpg"
  },
  {
    title: "Peppa Pig - Bright Balloons",
    videoId: "Egx3X4925n0",
    durationSec: 0,
    thumbnail: "https://i.ytimg.com/vi/Egx3X4925n0/hqdefault.jpg"
  },
  {
    title: "Peppa Pig - Sweet Shop Visit",
    videoId: "dsAtLI_3iGM",
    durationSec: 0,
    thumbnail: "https://i.ytimg.com/vi/dsAtLI_3iGM/hqdefault.jpg"
  },
  {
    title: "Peppa Pig - Farm Helpers",
    videoId: "tTjb2c8VKLw",
    durationSec: 0,
    thumbnail: "https://i.ytimg.com/vi/tTjb2c8VKLw/hqdefault.jpg"
  },
  {
    title: "Peppa Pig - Family Picnic",
    videoId: "OUhED0lXZRE",
    durationSec: 0,
    thumbnail: "https://i.ytimg.com/vi/OUhED0lXZRE/hqdefault.jpg"
  },
  {
    title: "Peppa Pig - Spooky Treats",
    videoId: "JyaktoYNM6k",
    durationSec: 0,
    thumbnail: "https://i.ytimg.com/vi/JyaktoYNM6k/hqdefault.jpg"
  }
];

function fallbackSuggestions(): SuggestedVideo[] {
  return FALLBACK_SUGGESTIONS.map((item) => ({ ...item }));
}

function toDurationLabel(sec: number) {
  if (!sec || Number.isNaN(sec) || sec <= 0) {
    return "--";
  }
  const minutes = Math.round(sec / 60);
  return `${minutes}m`;
}

function formatTime(sec: number) {
  const minutes = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    const win = window as any;
    if (win.YT && win.YT.Player) {
      resolve();
      return;
    }
    const existing = document.getElementById("yt-iframe-api");
    if (existing) {
      win.onYouTubeIframeAPIReady = () => resolve();
      return;
    }
    const tag = document.createElement("script");
    tag.id = "yt-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    win.onYouTubeIframeAPIReady = () => resolve();
    document.body.appendChild(tag);
  });
}

export default function App() {
  const [videoInput, setVideoInput] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisEnvelope | null>(null);
  const [meta, setMeta] = useState<EpisodeMeta | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [playingVideoId, setPlayingVideoId] = useState("");
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestedVideos, setSuggestedVideos] = useState<SuggestedVideo[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [apiReady, setApiReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkStartRef = useRef(0);
  const chunkIndexRef = useRef(0);
  const transcriptionQueue = useRef<Promise<void>>(Promise.resolve());
  const collectingRef = useRef(false);
  const autoplayPendingRef = useRef(false);

  function resolveRecorderOptions(): MediaRecorderOptions | undefined {
    if (
      typeof window === "undefined" ||
      typeof MediaRecorder === "undefined" ||
      !MediaRecorder.isTypeSupported
    ) {
      return undefined;
    }
    const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"];
    for (const mimeType of preferredTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return { mimeType };
      }
    }
    return undefined;
  }

  const highlightPairs: HighlightPair[] = useMemo(() => {
    const src = analysis?.analysis?.highlightPairs || analysis?.highlightPairs;
    if (!src) {
      return [];
    }
    return src.slice(0, 10);
  }, [analysis]);

  const durationText = useMemo(() => {
    if (!meta?.durationSec) {
      return "";
    }
    const min = Math.floor(meta.durationSec / 60);
    const sec = Math.floor(meta.durationSec % 60);
    return `${min}m ${sec.toString().padStart(2, "0")}s`;
  }, [meta?.durationSec]);

  useEffect(() => {
    loadYouTubeApi().then(() => setApiReady(true));
  }, []);

  useEffect(() => {
    if (!apiReady) {
      return;
    }
    const win = window as any;
    if (!playingVideoId) {
      if (playerRef.current) {
        playerRef.current.stopVideo();
        playerRef.current.destroy();
        playerRef.current = null;
        setPlayerReady(false);
      }
      return;
    }
    if (playerRef.current) {
      if (playerReady) {
        playerRef.current.cueVideoById(playingVideoId);
        if (autoplayPendingRef.current) {
          playerRef.current.playVideo();
          autoplayPendingRef.current = false;
        }
      }
      return;
    }
    if (!playerContainerRef.current) {
      return;
    }
    const YT = win.YT;
    playerRef.current = new YT.Player(playerContainerRef.current, {
      width: "100%",
      height: "100%",
      videoId: playingVideoId,
      playerVars: { autoplay: 0, controls: 1, rel: 0 },
      events: {
        onReady: () => {
          setPlayerReady(true);
          if (autoplayPendingRef.current && playerRef.current) {
            playerRef.current.playVideo();
            autoplayPendingRef.current = false;
          }
        }
      }
    });
  }, [apiReady, playingVideoId, playerReady]);

  useEffect(() => {
    async function loadSuggestions() {
      try {
        const res = await fetch(apiUrl("/suggestions"));
        const json = await res.json();
        if (res.ok && Array.isArray(json.videos) && json.videos.length > 0) {
          const mapped: SuggestedVideo[] = json.videos
            .map((item: any) => ({
              title: item.title as string,
              videoId: item.videoId as string,
              durationSec: Number(item.durationSec) || 0,
              thumbnail:
                (item.thumbnail as string | undefined) || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`
            }))
            .filter((item) => item.title && item.videoId)
            .slice(0, 8);
          if (mapped.length) {
            setSuggestedVideos(mapped.sort(() => Math.random() - 0.5));
            return;
          }
        }
        const fallback = fallbackSuggestions();
        setSuggestedVideos(fallback.sort(() => Math.random() - 0.5));
      } catch {
        const fallback = fallbackSuggestions();
        setSuggestedVideos(fallback.sort(() => Math.random() - 0.5));
      }
    }
    loadSuggestions();
  }, []);

  async function startSession(source?: string) {
    setError("");
    setInfo("");
    const sourceInput = (source ?? videoInput).trim();
    if (!sourceInput) {
      setError("Please paste a YouTube URL or video ID.");
      return;
    }
    const id = extractVideoId(sourceInput);
    if (!id) {
      setError("Please provide a valid YouTube URL or video ID.");
      return;
    }

    await stopCollection(false);
    setVideoInput(sourceInput);
    setAnalysis(null);
    setMeta(null);
    setTranscripts([]);
    setPlayingVideoId(id);
    chunkIndexRef.current = 0;
    autoplayPendingRef.current = true;

    try {
      const metaRes = await fetch(apiUrl(`/analyze?videoId=${encodeURIComponent(id)}`));
      const metaJson = await metaRes.json();
      if (!metaRes.ok) {
        setError(metaJson.error || "Unable to fetch video details.");
      } else {
        setMeta(metaJson.meta);
        if (metaJson.analysis) {
          setAnalysis(metaJson);
          setInfo("Used available captions for a quick preview. Whisper capture will add more detail.");
        } else if (metaJson.message) {
          setInfo(metaJson.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fetch video details.");
    }

    await beginAutoCollection(id);
    if (playerRef.current) {
      playerRef.current.cueVideoById(id);
    }
  }

  function extractVideoId(input: string) {
    try {
      const url = new URL(input);
      if (url.hostname.includes("youtu.be")) {
        return url.pathname.replace("/", "");
      }
      if (url.hostname.includes("youtube.com")) {
        const v = url.searchParams.get("v");
        if (v) {
          return v;
        }
        const segments = url.pathname.split("/").filter(Boolean);
        if (segments.length >= 2 && segments[0] === "embed") {
          return segments[1];
        }
      }
      return input;
    } catch {
      return input;
    }
  }

  async function beginAutoCollection(videoId: string) {
    if (!videoId) {
      return;
    }
    await stopCollection(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      let options: MediaRecorderOptions | undefined;
      try {
        options = resolveRecorderOptions();
      } catch {
        options = undefined;
      }
      let recorder: MediaRecorder;
      try {
        recorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
      } catch (err) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw err;
      }
      mediaRecorderRef.current = recorder;
      collectingRef.current = true;
      setIsCollecting(true);
      setInfo("Whisper is listening—play the video so sound reaches the mic.");

      recorder.onstart = () => {
        const current = playerRef.current && playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
        chunkStartRef.current = current;
      };

      recorder.ondataavailable = (event) => {
        if (!collectingRef.current || !event.data || event.data.size === 0) {
          return;
        }
        const chunkStart = chunkStartRef.current;
        const currentTime = playerRef.current && playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : chunkStart + SLICE_MS / 1000;
        chunkStartRef.current = currentTime;
        const chunkIndex = chunkIndexRef.current++;
        transcriptionQueue.current = transcriptionQueue.current
          .catch(() => {})
          .then(() => transcribeChunk(event.data, chunkStart, chunkIndex));
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      recorder.start(SLICE_MS);
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      let message = "Could not access the microphone.";
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          message = "Microphone permission was denied. Allow access to start Whisper capture.";
        } else if (err.name === "NotFoundError") {
          message = "No microphone was found. Check your input device settings.";
        } else if (err.name === "NotSupportedError" || err.message.includes("Invalid constraint")) {
          message =
            "This browser does not support the selected audio recording format. Try updating Safari or using Chrome.";
        } else {
          message = err.message || message;
        }
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      setError(message);
      setIsCollecting(false);
      collectingRef.current = false;
    }
  }

  async function stopCollection(andAnalyze: boolean) {
    collectingRef.current = false;
    setIsCollecting(false);
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    await transcriptionQueue.current.catch(() => {});
    if (andAnalyze) {
      await analyzeTranscripts();
    }
  }

  async function transcribeChunk(blob: Blob, ts: number, idx: number) {
    const fd = new FormData();
    fd.append("audio", blob, `chunk-${idx}.webm`);
    try {
      const stt = await fetch(apiUrl("/stt"), { method: "POST", body: fd }).then((r) => r.json());
      const text = (stt.text || "").trim();
      if (!text) {
        return;
      }
      setTranscripts((prev) => {
        const next = [...prev, { text, ts }];
        next.sort((a, b) => a.ts - b.ts);
        return next;
      });
      setInfo(`Recognized: "${text}"`);
    } catch (err) {
      console.error("Whisper chunk failed", err);
    }
  }

  async function analyzeTranscripts() {
    if (!playingVideoId) {
      setError("Start the video first before analyzing.");
      return;
    }
    if (!transcripts.length) {
      setError("No Whisper transcripts yet. Try recording a little longer.");
      return;
    }
    setIsAnalyzing(true);
    setError("");
    setInfo("Mixing Whisper captions into highlight phrases...");
    try {
      const res = await fetch(apiUrl("/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: playingVideoId, transcript: transcripts })
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "Analysis failed. Please try again.");
      } else {
        setAnalysis(json);
        setInfo("Highlight phrases updated using the latest Whisper transcripts.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function playVideo() {
    if (!playerRef.current && playingVideoId) {
      autoplayPendingRef.current = true;
    }
    playerRef.current?.playVideo?.();
  }

  function pauseVideo() {
    playerRef.current?.pauseVideo?.();
  }

  function seekTo(ts: number) {
    if (!playerRef.current) {
      return;
    }
    playerRef.current.seekTo(ts, true);
    playerRef.current.playVideo();
  }

  function updateTranscript(index: number, value: string) {
    setTranscripts((prev) => prev.map((entry, i) => (i === index ? { ...entry, text: value } : entry)));
  }

  function removeTranscript(index: number) {
    setTranscripts((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditDraft("");
    }
  }

  const embedReady = apiReady && !!playingVideoId;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <header style={styles.header}>
          <span style={styles.badge}>BETA</span>
          <h1 style={styles.title}>Peppa Playground</h1>
          <p style={styles.subtitle}>
            Whisper helps Peppa and your little one explore gentle English phrases! Pick a video, capture the lines together, and practice playfully.
          </p>
        </header>

        <div style={styles.layout}>
          <div style={styles.leftColumn}>
            <section style={styles.suggestSection}>
              <h2 style={styles.sectionTitle}>Pick Your Episode</h2>
              <p style={styles.sectionDesc}>Choose a Peppa Pig adventure (10-15 min) and jump right in!</p>
              <div style={styles.suggestGrid}>
                {suggestedVideos.map((item, idx) => (
                  <button
                    key={item.videoId || idx}
                    style={styles.suggestCard}
                    onClick={() => !isCollecting && !isAnalyzing && startSession(`https://www.youtube.com/watch?v=${item.videoId}`)}
                    disabled={isCollecting || isAnalyzing}
                  >
                    <div style={styles.suggestThumbWrap}>
                      <img src={item.thumbnail} alt={item.title} style={styles.suggestThumb} loading="lazy" />
                      <span style={styles.suggestBadge}>{toDurationLabel(item.durationSec)}</span>
                    </div>
                    <p style={styles.suggestTitle}>{item.title}</p>
                  </button>
                ))}
              </div>
            </section>

            <div style={styles.inputRow}>
              <div style={styles.inputWrapper}>
                <label style={styles.label}>YouTube Link</label>
                <input
                  style={styles.input}
                  placeholder="https://youtu.be/..."
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  disabled={isCollecting || isAnalyzing}
                />
              </div>
              <button style={styles.primaryButton} onClick={() => startSession()} disabled={isCollecting || isAnalyzing || !videoInput.trim()}>
                Start
              </button>
              {isCollecting && (
                <button style={styles.ghostButton} onClick={() => stopCollection(true)}>
                  Stop & Analyze
                </button>
              )}
              {!isCollecting && transcripts.length > 0 && (
                <button style={styles.secondaryButton} onClick={() => analyzeTranscripts()} disabled={isAnalyzing}>
                  {isAnalyzing ? "Working..." : "Analyze Again"}
                </button>
              )}
            </div>

            {error && <p style={styles.error}>{error}</p>}
            {info && !error && <p style={styles.info}>{info}</p>}

            <section style={styles.playerSection}>
              <div style={styles.playerWrapper}>
                {embedReady ? <div ref={playerContainerRef} style={styles.playerFrame} /> : <div style={styles.playerPlaceholder}><p style={styles.placeholderText}>Choose a video above to get the stage ready.</p></div>}
              </div>
              <div style={styles.playerControls}>
                <button style={styles.controlButton} onClick={playVideo} disabled={!playingVideoId}>
                  ▶ Play
                </button>
                <button style={styles.controlButton} onClick={pauseVideo} disabled={!playingVideoId}>
                  ⏸ Pause
                </button>
              </div>
            </section>

            {meta && (
              <section style={styles.metaSection}>
                <div>
                  <p style={styles.metaTitle}>{meta.title}</p>
                  {durationText && <p style={styles.metaSub}>{durationText}</p>}
                </div>
                <p style={styles.metaHint}>Tip: keep the speaker close to your mic so Whisper can hear every giggle.</p>
              </section>
            )}

            <section style={styles.statusSection}>
              <div style={styles.statusBadge}>{isCollecting ? "Whisper Listening" : "Ready"}</div>
              <p style={styles.statusText}>
                Captured lines: <strong>{transcripts.length}</strong>
              </p>
            </section>

            {highlightPairs.length > 0 && (
              <section>
                <h2 style={styles.sectionTitle}>Favorite Expressions</h2>
                <p style={styles.sectionDesc}>Tap an expression to jump to that magical moment and practice it together.</p>
                <ol style={styles.pairList}>
                  {highlightPairs.map((pair, idx) => (
                    <li key={idx}>
                      <button style={styles.pairButton} onClick={() => seekTo(pair.ts)}>
                        <div style={styles.pairHeader}>
                          <span style={styles.pairIndex}>{idx + 1}</span>
                          <span style={styles.pairTime}>{formatTime(pair.ts)}</span>
                        </div>
                        <div style={styles.lineBlock}>
                          <span style={styles.speaker}>Peppa</span>
                          <p style={styles.lineText}>{pair.childLine}</p>
                        </div>
                        <div style={styles.lineBlock}>
                          <span style={styles.speaker}>Buddy</span>
                          <p style={styles.lineText}>{pair.partnerLine}</p>
                        </div>
                        <p style={styles.pairContext}>{pair.context}</p>
                        <p style={styles.pairTip}>{pair.tip}</p>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          <aside style={styles.rightColumn}>
            <div style={styles.logHeader}>
              <h2 style={styles.logTitle}>Whisper Log</h2>
              <span style={styles.logCount}>{transcripts.length}</span>
              <button style={styles.logClear} onClick={() => { setTranscripts([]); setEditingIndex(null); setEditDraft(""); }} disabled={!transcripts.length}>
                Clear
              </button>
            </div>
            <div style={styles.logList}>
              {transcripts.map((entry, idx) => {
                const editing = editingIndex === idx;
                return (
                  <div key={`${entry.ts}-${idx}`} style={styles.logItem}>
                    <div style={styles.logTime}>{formatTime(entry.ts)}</div>
                    {editing ? (
                      <div style={styles.logEditor}>
                        <textarea style={styles.logTextarea} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} />
                        <div style={styles.logActions}>
                          <button style={styles.actionPrimary} onClick={() => { updateTranscript(idx, editDraft.trim()); setEditingIndex(null); setEditDraft(""); }} disabled={!editDraft.trim()}>
                            Save
                          </button>
                          <button style={styles.actionGhost} onClick={() => { setEditingIndex(null); setEditDraft(""); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p style={styles.logText}>{entry.text}</p>
                        <div style={styles.logActions}>
                          <button style={styles.actionGhost} onClick={() => { setEditingIndex(idx); setEditDraft(entry.text); }}>
                            Edit
                          </button>
                          <button style={styles.actionDanger} onClick={() => removeTranscript(idx)}>
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {!transcripts.length && <p style={styles.logEmpty}>Whisper log is empty. Press Play to start listening!</p>}
            </div>
            {transcripts.length > 0 && (
              <button style={styles.primaryButton} onClick={analyzeTranscripts} disabled={isAnalyzing}>
                {isAnalyzing ? "Working..." : "Make Highlights"}
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    margin: 0,
    background: "linear-gradient(180deg, #ffe6f7 0%, #eef2ff 100%)",
    padding: "48px 32px",
    fontFamily: "'Comic Sans MS', 'Baloo 2', 'Fredoka', cursive"
  },
  card: {
    maxWidth: "1200px",
    margin: "0 auto",
    background: "#fff",
    borderRadius: "32px",
    padding: "36px",
    boxShadow: "0 28px 60px rgba(120, 89, 235, 0.25)"
  },
  header: { textAlign: "center", marginBottom: "32px" },
  badge: {
    display: "inline-block",
    background: "#ffe066",
    color: "#8a2be2",
    padding: "6px 16px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 700
  },
  title: { margin: "20px 0 10px", fontSize: "38px", fontWeight: 800, color: "#4438ca" },
  subtitle: { margin: 0, color: "#4c4f94", lineHeight: 1.6, fontSize: "16px" },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)",
    gap: "28px",
    alignItems: "start"
  },
  leftColumn: { minWidth: 0 },
  rightColumn: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
    background: "#f7f1ff",
    borderRadius: "24px",
    padding: "24px",
    border: "1px solid #ddd3ff",
    boxShadow: "0 16px 40px rgba(135, 105, 255, 0.2)",
    height: "100%",
    maxHeight: "720px"
  },
  suggestSection: { marginBottom: "30px" },
  sectionTitle: { fontSize: "24px", fontWeight: 800, color: "#312e81", marginBottom: "12px" },
  sectionDesc: { margin: "0 0 16px", color: "#5b5c92" },
  suggestGrid: {
    display: "grid",
    gap: "16px",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
  },
  suggestCard: {
    borderRadius: "18px",
    border: "1px solid #e5e7ff",
    background: "#f8f7ff",
    textAlign: "left" as const,
    cursor: "pointer",
    color: "#2d2a67",
    boxShadow: "0 12px 26px rgba(116, 104, 255, 0.18)",
    overflow: "hidden" as const,
    display: "flex",
    flexDirection: "column" as const,
    transition: "transform 0.15s ease"
  },
  suggestThumbWrap: {
    position: "relative",
    width: "100%",
    paddingTop: "56.25%",
    background: "#dcd9ff"
  },
  suggestThumb: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const
  },
  suggestBadge: {
    position: "absolute" as const,
    right: "10px",
    bottom: "10px",
    background: "rgba(40, 30, 80, 0.8)",
    color: "#fff",
    padding: "4px 10px",
    borderRadius: "10px",
    fontSize: "12px",
    fontWeight: 700
  },
  suggestTitle: {
    margin: "14px 14px 16px",
    fontWeight: 700,
    fontSize: "15px",
    lineHeight: 1.4,
    color: "#2d2a67"
  },
  inputRow: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
    flexWrap: "wrap" as const,
    marginBottom: "24px"
  },
  inputWrapper: { flex: "1 1 260px" },
  label: { display: "block", fontSize: "14px", color: "#5c63ff", marginBottom: "6px", fontWeight: 700 },
  input: {
    width: "100%",
    padding: "15px 18px",
    borderRadius: "16px",
    border: "1px solid #d0d4ff",
    fontSize: "15px",
    outline: "none",
    boxShadow: "0 6px 14px rgba(120, 108, 255, 0.12)",
    background: "#ffffff"
  },
  primaryButton: {
    padding: "14px 26px",
    background: "linear-gradient(90deg, #8c7bff 0%, #ff75c3 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "18px",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
    minWidth: "110px"
  },
  ghostButton: {
    padding: "12px 18px",
    background: "#fff",
    color: "#7c3aed",
    border: "1px solid #c4b5fd",
    borderRadius: "14px",
    fontWeight: 600,
    cursor: "pointer"
  },
  secondaryButton: {
    padding: "12px 18px",
    background: "#f0ebff",
    color: "#4c3ad1",
    border: "none",
    borderRadius: "14px",
    fontWeight: 600,
    cursor: "pointer"
  },
  error: {
    color: "#d32f2f",
    background: "#ffe2e2",
    padding: "12px 16px",
    borderRadius: "14px",
    marginBottom: "16px"
  },
  info: {
    color: "#5b3fd6",
    background: "#efeaff",
    padding: "12px 16px",
    borderRadius: "14px",
    marginBottom: "16px"
  },
  playerSection: { marginBottom: "24px" },
  playerWrapper: {
    position: "relative",
    width: "100%",
    paddingTop: "56.25%",
    borderRadius: "20px",
    overflow: "hidden",
    boxShadow: "0 24px 40px rgba(120, 108, 255, 0.18)",
    background: "#eef0ff"
  },
  playerFrame: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%"
  },
  playerPlaceholder: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #ede9fe 0%, #fdf3ff 100%)"
  },
  placeholderText: {
    color: "#6c48ff",
    fontWeight: 700,
    fontSize: "16px"
  },
  playerControls: {
    display: "flex",
    gap: "12px",
    marginTop: "12px"
  },
  controlButton: {
    padding: "10px 18px",
    borderRadius: "16px",
    border: "1px solid #bfc3ff",
    background: "#fff",
    color: "#5146ff",
    fontWeight: 600,
    cursor: "pointer"
  },
  metaSection: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    background: "#f8fbff",
    borderRadius: "18px",
    padding: "20px",
    border: "1px solid #d4dbff",
    marginBottom: "20px"
  },
  metaTitle: { margin: 0, fontSize: "18px", fontWeight: 700, color: "#1f2a5a" },
  metaSub: { margin: "4px 0 0", color: "#6366f1", fontWeight: 600 },
  metaHint: { margin: 0, fontSize: "14px", color: "#4d5285", maxWidth: "320px", lineHeight: 1.4 },
  statusSection: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "24px"
  },
  statusBadge: {
    padding: "6px 14px",
    background: "#fff7d6",
    color: "#c26f1a",
    borderRadius: "999px",
    fontWeight: 700
  },
  statusText: { margin: 0, color: "#3c3f6c", fontSize: "15px" },
  pairList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: "12px"
  },
  pairButton: {
    width: "100%",
    textAlign: "left" as const,
    padding: "16px 20px",
    borderRadius: "18px",
    border: "1px solid #d6d8ff",
    background: "#f0f1ff",
    boxShadow: "0 12px 24px rgba(120, 108, 255, 0.18)",
    cursor: "pointer"
  },
  pairHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  pairIndex: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    background: "#6658f1",
    color: "#fff",
    fontWeight: 700
  },
  pairTime: { color: "#6658f1", fontWeight: 600 },
  lineBlock: { display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "6px" },
  speaker: {
    display: "inline-block",
    minWidth: "52px",
    padding: "4px 10px",
    borderRadius: "999px",
    background: "#d6d0ff",
    color: "#423ab1",
    fontWeight: 700,
    fontSize: "12px",
    textAlign: "center" as const
  },
  lineText: { margin: 0, color: "#1f2559", fontSize: "15px", fontWeight: 600 },
  pairContext: { margin: "8px 0 0", color: "#4d4f8c", fontSize: "14px" },
  pairTip: { margin: "4px 0 0", color: "#e3517a", fontSize: "14px", fontWeight: 700 },
  logHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  logTitle: { margin: 0, fontSize: "20px", fontWeight: 800, color: "#543cd9" },
  logCount: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "26px",
    padding: "2px 8px",
    borderRadius: "999px",
    background: "#e2e0ff",
    color: "#4031b5",
    fontWeight: 700
  },
  logClear: {
    marginLeft: "auto",
    padding: "6px 12px",
    borderRadius: "12px",
    border: "1px solid #c4b5fd",
    background: "#fff",
    color: "#5744d6",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600
  },
  logList: {
    flex: "1 1 auto",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px"
  },
  logItem: {
    background: "#fff",
    borderRadius: "18px",
    padding: "12px",
    border: "1px solid #ede9fe",
    boxShadow: "0 10px 24px rgba(135, 105, 255, 0.16)"
  },
  logTime: { fontSize: "12px", color: "#6e62ff", fontWeight: 700, marginBottom: "6px" },
  logText: { margin: 0, color: "#1f2559", fontSize: "15px", lineHeight: 1.5 },
  logEditor: { display: "flex", flexDirection: "column" as const, gap: "8px" },
  logTextarea: {
    width: "100%",
    borderRadius: "12px",
    border: "1px solid #cdd1ff",
    padding: "10px",
    fontSize: "14px",
    resize: "vertical" as const
  },
  logActions: { display: "flex", gap: "8px", marginTop: "8px" },
  actionPrimary: {
    padding: "8px 12px",
    borderRadius: "12px",
    border: "none",
    background: "#6f5dff",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer"
  },
  actionGhost: {
    padding: "8px 12px",
    borderRadius: "12px",
    border: "1px solid #cdd1ff",
    background: "#fff",
    color: "#584bff",
    fontWeight: 600,
    cursor: "pointer"
  },
  actionDanger: {
    padding: "8px 12px",
    borderRadius: "12px",
    border: "none",
    background: "#ff7a8b",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer"
  },
  logEmpty: { color: "#6e62ff", textAlign: "center" as const, margin: "40px 0" }
} as const;
