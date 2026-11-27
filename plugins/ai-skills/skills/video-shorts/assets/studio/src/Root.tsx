import { Composition, type CalculateMetadataFunction } from "remotion";
import { Short } from "./Short";
import { shortSchema, type ShortProps } from "./schema";

export const FPS = 30;

const calculateMetadata: CalculateMetadataFunction<ShortProps> = ({ props }) => ({
    durationInFrames: Math.max(1, props.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0)),
});

const placeholder: ShortProps = {
    brand: {
        colors: { background: "#f5f7fa", ink: "#14213d", primary: "#2d5bab", on_primary: "#ffffff", accent: "#2a7d45", muted: "#4a5d78" },
        fontFamily: "system-ui",
        fontFile: null,
        logo: null,
    },
    music: null,
    footnote: null,
    scenes: [
        { id: "hook", kind: "hook", durationInFrames: 75, voiceFrom: 3, voiceFrames: 60, voiceFile: null, caption: "", title: "Render with props from render.mjs" },
    ],
};

// 9:16 only: Shorts and Reels. render.mjs passes the real props with --props.
export const RemotionRoot = () => (
    <Composition
        id="Short"
        component={Short}
        schema={shortSchema}
        durationInFrames={75}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={placeholder}
        calculateMetadata={calculateMetadata}
    />
);
