import { loadFont } from "@remotion/fonts";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Easing, Img, Sequence, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Brand, SceneProps, ShortProps } from "./schema";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) } as const;

// 1080x1920 layout. Keep text out of the top 250 px and bottom 400 px, where Shorts and Reels draw their UI.
const L = {
    side: 80,
    logo: { y: 130, height: 52 },
    headline: { y: 260, fontSize: 72 },
    screen: { y: 560, width: 1000, maxHeight: 720 },
    disclaimer: { gap: 12, fontSize: 24 },
    caption: { y: 1330, fontSize: 50 },
    footnote: { y: 1490, fontSize: 26 },
};

const BED_VOLUME = 0.18;
const DUCKED_VOLUME = 0.07;
const DUCK_RAMP_FRAMES = 8;
const MAX_WORDS = 7;

/** Music bed at ~18% between lines, ducked to ~7% under the voice, with short ramps and a fade in and out. */
const Music = ({ src, scenes }: { src: string; scenes: SceneProps[] }) => {
    const { durationInFrames, fps } = useVideoConfig();
    const voice: Array<[number, number]> = [];
    let offset = 0;
    for (const scene of scenes) {
        if (scene.voiceFile) voice.push([offset + scene.voiceFrom, offset + scene.voiceFrom + scene.voiceFrames]);
        offset += scene.durationInFrames;
    }
    const level = (frame: number) => {
        const distance = Math.min(...voice.map(([start, end]) => (frame < start ? start - frame : frame > end ? frame - end : 0)), DUCK_RAMP_FRAMES);
        return interpolate(distance, [0, DUCK_RAMP_FRAMES], [DUCKED_VOLUME, BED_VOLUME]);
    };
    const fade = (frame: number) => interpolate(frame, [0, fps * 0.6, durationInFrames - fps * 1.5, durationInFrames - 1], [0, 1, 1, 0], clamp);
    return <Audio src={staticFile(src)} volume={(frame) => level(frame) * fade(frame)} />;
};

/** Splits a line into short caption chunks, breaking at punctuation first. */
export function chunkCaption(text: string): string[] {
    const phrases = text.match(/[^,.;:?!]+[,.;:?!]*/g)?.map((phrase) => phrase.trim()).filter(Boolean) ?? [text];
    const chunks: string[] = [];
    for (const phrase of phrases) {
        const words = phrase.split(/\s+/);
        const size = Math.ceil(words.length / Math.ceil(words.length / MAX_WORDS));
        for (let index = 0; index < words.length; index += size) chunks.push(words.slice(index, index + size).join(" "));
    }
    return chunks;
}

const Captions = ({ text, from, frames, brand }: { text: string; from: number; frames: number; brand: Brand }) => {
    const frame = useCurrentFrame();
    const chunks = chunkCaption(text);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
    const spans = chunks.reduce<{ chunk: string; start: number; end: number }[]>((acc, chunk) => {
        const start = acc.length ? acc[acc.length - 1].end : from;
        return [...acc, { chunk, start, end: start + Math.max(8, Math.round((chunk.length / total) * frames)) }];
    }, []);
    const last = spans[spans.length - 1];
    const active = spans.find((span) => frame >= span.start && frame < span.end) ?? (frame >= (last?.end ?? 0) ? last : spans[0]);
    if (!active || frame < from - 3) return null;
    const local = frame - active.start;
    return (
        <div style={{ position: "absolute", left: L.side, right: L.side, top: L.caption.y, display: "flex", justifyContent: "center" }}>
            <span
                style={{
                    fontSize: L.caption.fontSize,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    textAlign: "center",
                    color: brand.colors.on_primary,
                    backgroundColor: brand.colors.ink,
                    padding: "0.18em 0.5em",
                    borderRadius: 14,
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                    opacity: interpolate(local, [0, 4], [0.4, 1], clamp),
                    translate: `0 ${interpolate(local, [0, 5], [8, 0], clamp)}px`,
                }}
            >
                {active.chunk}
            </span>
        </div>
    );
};

const Logo = ({ brand, top = L.logo.y, height = L.logo.height }: { brand: Brand; top?: number; height?: number }) =>
    brand.logo ? <Img src={staticFile(brand.logo)} style={{ position: "absolute", top: top - height / 2, left: "50%", translate: "-50% 0", height }} /> : null;

const Headline = ({ text, brand }: { text: string; brand: Brand }) => {
    const frame = useCurrentFrame();
    return (
        <div
            style={{
                position: "absolute",
                left: L.side,
                right: L.side,
                top: L.headline.y,
                fontSize: L.headline.fontSize,
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                textAlign: "center",
                textWrap: "balance",
                color: brand.colors.ink,
                opacity: interpolate(frame, [0, 12], [0, 1], ease),
                translate: `0 ${interpolate(frame, [0, 14], [24, 0], ease)}px`,
            }}
        >
            {text}
        </div>
    );
};

/** Window around a real product screen or recording, with its source label and the profile's required disclaimer under it. */
const ScreenFrame = ({ aspect, label, disclaimer, brand, children }: { aspect: number; label?: string; disclaimer?: string; brand: Brand; children: React.ReactNode }) => {
    const frame = useCurrentFrame();
    const width = Math.min(L.screen.width, L.screen.maxHeight * aspect);
    const height = width / aspect;
    return (
        <div style={{ position: "absolute", left: (1080 - width) / 2, top: L.screen.y + (L.screen.maxHeight - height) / 2, width, opacity: interpolate(frame, [2, 14], [0, 1], ease), scale: interpolate(frame, [2, 18], [0.96, 1], ease) }}>
            {label && (
                <div style={{ position: "absolute", top: -50, left: 0, display: "flex", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 700, color: brand.colors.accent }}>
                    <span style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: brand.colors.accent }} />
                    {label}
                </div>
            )}
            <div style={{ position: "relative", width, height, overflow: "hidden", borderRadius: 22, backgroundColor: "#fff", boxShadow: "0 30px 70px rgba(0,0,0,0.18)" }}>{children}</div>
            {disclaimer && (
                <div style={{ position: "absolute", top: height + L.disclaimer.gap, left: 0, right: 0, textAlign: "center", fontSize: L.disclaimer.fontSize, lineHeight: 1.2, fontWeight: 600, color: brand.colors.ink }}>{disclaimer}</div>
            )}
        </div>
    );
};

/** Pans and zooms from the focus box to panTo (both in image pixels), never showing past the image edges. */
const ScreenImage = ({ scene, frameWidth, frameHeight }: { scene: SceneProps; frameWidth: number; frameHeight: number }) => {
    const frame = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();
    const w = scene.imageWidth ?? frameWidth;
    const h = scene.imageHeight ?? frameHeight;
    const camera = (focus: { x: number; y: number; w: number; h: number }) => {
        const cover = Math.max(frameWidth / w, frameHeight / h);
        const scale = Math.max(cover, Math.min(frameWidth / focus.w, frameHeight / focus.h, cover * 2.4));
        const x = Math.min(0, Math.max(frameWidth - w * scale, frameWidth / 2 - (focus.x + focus.w / 2) * scale));
        const y = Math.min(0, Math.max(frameHeight - h * scale, frameHeight / 2 - (focus.y + focus.h / 2) * scale));
        return { scale, x, y };
    };
    const start = camera(scene.focus ?? { x: 0, y: 0, w, h });
    const end = scene.panTo ? camera(scene.panTo) : start;
    const t = interpolate(frame, [durationInFrames * 0.25, durationInFrames * 0.85], [0, 1], { ...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1) });
    const mix = (a: number, b: number) => a + (b - a) * t;
    return <Img src={staticFile(scene.image!)} style={{ position: "absolute", left: mix(start.x, end.x), top: mix(start.y, end.y), width: w * mix(start.scale, end.scale), height: h * mix(start.scale, end.scale) }} />;
};

const SceneView = ({ scene, brand }: { scene: SceneProps; brand: Brand }) => {
    const frame = useCurrentFrame();
    const c = brand.colors;
    if (scene.kind === "hook") {
        const title = scene.title ?? "";
        const at = scene.highlight ? title.lastIndexOf(scene.highlight) : -1;
        return (
            <AbsoluteFill style={{ backgroundColor: c.ink, alignItems: "center", justifyContent: "center", padding: `0 ${L.side}px 220px` }}>
                <div style={{ fontSize: 108, fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.025em", color: c.on_primary, textAlign: "center", textWrap: "balance", scale: interpolate(frame, [0, 10], [1.06, 1], ease) }}>
                    {at >= 0 ? title.slice(0, at) : title}
                    {at >= 0 && <span style={{ color: c.accent }}>{title.slice(at)}</span>}
                </div>
            </AbsoluteFill>
        );
    }
    if (scene.kind === "screen" && scene.image) {
        const aspect = 1000 / 720;
        const width = Math.min(L.screen.width, L.screen.maxHeight * aspect);
        return (
            <>
                {scene.headline && <Headline text={scene.headline} brand={brand} />}
                <ScreenFrame aspect={aspect} label={scene.label} disclaimer={scene.disclaimer} brand={brand}>
                    <ScreenImage scene={scene} frameWidth={width} frameHeight={width / aspect} />
                </ScreenFrame>
            </>
        );
    }
    if (scene.kind === "footage" && scene.video) {
        const aspect = 1000 / 720;
        return (
            <>
                {scene.headline && <Headline text={scene.headline} brand={brand} />}
                <ScreenFrame aspect={aspect} label={scene.label} disclaimer={scene.disclaimer} brand={brand}>
                    <Video src={staticFile(scene.video)} muted playbackRate={scene.playbackRate ?? 1} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </ScreenFrame>
            </>
        );
    }
    if (scene.kind === "statement") {
        return (
            <div style={{ position: "absolute", left: L.side, right: L.side, top: 420, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 36 }}>
                <div style={{ width: 120, height: 12, borderRadius: 999, backgroundColor: c.accent, scale: `${interpolate(frame, [0, 14], [0, 1], ease)} 1` }} />
                <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.02em", textWrap: "balance", color: c.ink, opacity: interpolate(frame, [4, 16], [0, 1], ease) }}>{scene.title}</div>
                {scene.body && <div style={{ fontSize: 46, lineHeight: 1.3, color: c.muted, textWrap: "balance", opacity: interpolate(frame, [10, 22], [0, 1], ease) }}>{scene.body}</div>}
            </div>
        );
    }
    if (scene.kind === "cta") {
        const appear = (start: number) => ({ opacity: interpolate(frame, [start, start + 12], [0, 1], ease), translate: `0 ${interpolate(frame, [start, start + 14], [26, 0], ease)}px` });
        return (
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 56, paddingBottom: 220, textAlign: "center" }}>
                {brand.logo && <Img src={staticFile(brand.logo)} style={{ height: 110, ...appear(0) }} />}
                {scene.title && <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em", color: c.ink, padding: `0 ${L.side}px`, ...appear(6) }}>{scene.title}</div>}
                {scene.body && <div style={{ fontSize: 42, fontWeight: 600, color: c.muted, padding: `0 ${L.side}px`, ...appear(12) }}>{scene.body}</div>}
                {scene.url && <div style={{ padding: "26px 54px", borderRadius: 999, backgroundColor: c.accent, color: "#fff", fontSize: 52, fontWeight: 800, ...appear(18) }}>{scene.url}</div>}
            </AbsoluteFill>
        );
    }
    return null;
};

const loadedFonts = new Set<string>();

export const Short = ({ brand, music, footnote, scenes }: ShortProps) => {
    if (brand.fontFile && !loadedFonts.has(brand.fontFile)) {
        loadedFonts.add(brand.fontFile);
        loadFont({ family: brand.fontFamily, url: staticFile(brand.fontFile), weight: "100 900" }).catch(() => undefined);
    }
    return (
        <AbsoluteFill style={{ backgroundColor: brand.colors.background, fontFamily: `"${brand.fontFamily}", system-ui, sans-serif`, color: brand.colors.ink }}>
            {music && <Music src={music} scenes={scenes} />}
            <Series>
                {scenes.map((scene) => (
                    <Series.Sequence key={scene.id} name={scene.id} durationInFrames={scene.durationInFrames}>
                        <AbsoluteFill>
                            <SceneView scene={scene} brand={brand} />
                            {scene.kind !== "hook" && scene.kind !== "cta" && <Logo brand={brand} />}
                            {footnote && (scene.kind === "screen" || scene.kind === "footage") && (
                                <div style={{ position: "absolute", top: L.footnote.y, left: 0, right: 0, textAlign: "center", fontSize: L.footnote.fontSize, color: brand.colors.muted, fontWeight: 500 }}>{footnote}</div>
                            )}
                            {scene.kind !== "hook" && scene.kind !== "cta" && scene.caption && <Captions text={scene.caption} from={scene.voiceFrom} frames={scene.voiceFrames} brand={brand} />}
                            {scene.voiceFile && (
                                <Sequence from={scene.voiceFrom} name={`voice ${scene.id}`}>
                                    <Audio src={staticFile(scene.voiceFile)} />
                                </Sequence>
                            )}
                        </AbsoluteFill>
                    </Series.Sequence>
                ))}
            </Series>
        </AbsoluteFill>
    );
};
