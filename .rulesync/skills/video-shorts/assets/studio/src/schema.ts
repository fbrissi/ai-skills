import { z } from "zod";

const box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const sceneSchema = z.object({
    id: z.string(),
    kind: z.enum(["hook", "screen", "footage", "statement", "cta"]),
    durationInFrames: z.number().int().positive(),
    voiceFrom: z.number().int(),
    voiceFrames: z.number().int(),
    voiceFile: z.string().nullable(),
    caption: z.string(),
    title: z.string().optional(),
    highlight: z.string().optional(),
    headline: z.string().optional(),
    body: z.string().optional(),
    url: z.string().optional(),
    label: z.string().optional(),
    disclaimer: z.string().optional(),
    synthetic: z.boolean().optional(),
    image: z.string().optional(),
    imageWidth: z.number().optional(),
    imageHeight: z.number().optional(),
    focus: box.optional(),
    panTo: box.optional(),
    video: z.string().optional(),
    playbackRate: z.number().optional(),
});

export const shortSchema = z.object({
    brand: z.object({
        colors: z.object({
            background: z.string(),
            ink: z.string(),
            primary: z.string(),
            on_primary: z.string(),
            accent: z.string(),
            muted: z.string(),
        }),
        fontFamily: z.string(),
        fontFile: z.string().nullable(),
        logo: z.string().nullable(),
    }),
    music: z.string().nullable(),
    musicVolume: z.object({ bed: z.number().gt(0).lte(1), ducked: z.number().gt(0).lte(1) }),
    footnote: z.string().nullable(),
    scenes: z.array(sceneSchema),
});

export type ShortProps = z.infer<typeof shortSchema>;
export type SceneProps = z.infer<typeof sceneSchema>;
export type Brand = ShortProps["brand"];
