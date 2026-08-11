/**
 * Production asset manifest + runtime atlas schemas (Blueprint §32–§33).
 *
 * The manifest is authored by ChatGPT/System Architect and read from disk, so it is EXTERNAL input
 * to this code: it gets validated with Zod at the boundary exactly like a provider payload. A typo
 * in approved metadata must surface as a clear validation error, never as a silently missing sprite.
 */

import {
  AssetCategorySchema,
  AssetIdSchema,
  NonEmptyStringSchema,
  NonNegativeIntSchema,
  PivotSchema,
} from '@dance-arena/contracts';
import { z } from 'zod';

/**
 * Where an asset lives at runtime.
 *
 * The locked package uses two shapes: atlas-backed assets carry `{atlas, meta, frame}`, while an
 * asset too large to pack (the stage background) carries a standalone `{file}`.
 */
export const AtlasRuntimeRefSchema = z.object({
  atlas: NonEmptyStringSchema,
  meta: NonEmptyStringSchema,
  frame: NonEmptyStringSchema,
});

export const StandaloneRuntimeRefSchema = z.object({
  file: NonEmptyStringSchema,
});

export const AssetRuntimeRefSchema = z.union([AtlasRuntimeRefSchema, StandaloneRuntimeRefSchema]);

export type AtlasRuntimeRef = z.infer<typeof AtlasRuntimeRefSchema>;

export type StandaloneRuntimeRef = z.infer<typeof StandaloneRuntimeRefSchema>;

export type AssetRuntimeRef = z.infer<typeof AssetRuntimeRefSchema>;

export function isAtlasRuntimeRef(ref: AssetRuntimeRef | undefined): ref is AtlasRuntimeRef {
  return ref !== undefined && 'atlas' in ref;
}

export function isStandaloneRuntimeRef(
  ref: AssetRuntimeRef | undefined,
): ref is StandaloneRuntimeRef {
  return ref !== undefined && 'file' in ref;
}

/**
 * One logical asset.
 *
 * `png` is optional on purpose: the repository tracks the WebP runtime distribution while the PNG
 * editing sources stay in the owner's locked package (see `.gitignore`). Runtime must never depend
 * on a PNG being present.
 */
export const ProductionAssetSchema = z.object({
  id: AssetIdSchema,
  category: AssetCategorySchema,
  png: z.string().optional(),
  webp: NonEmptyStringSchema,
  width: NonNegativeIntSchema,
  height: NonNegativeIntSchema,
  alpha: z.boolean().optional(),
  sha256: z.string().optional(),
  byteSize: NonNegativeIntSchema.optional(),
  mime: z.string().optional(),
  pivot: PivotSchema.optional(),
  usedBy: z.array(z.string()).optional(),
  /** Absolute pixel socket plus its normalized form; the normalized form is what renderers use. */
  headSocket: z
    .object({
      x: z.number(),
      y: z.number(),
      radius: z.number(),
      normalized: z.tuple([z.number(), z.number(), z.number()]),
    })
    .optional(),
  notes: z.string().optional(),
  runtime: AssetRuntimeRefSchema.optional(),
  status: z.string().optional(),
});

export type ProductionAsset = z.infer<typeof ProductionAssetSchema>;

export const AtlasSummarySchema = z.object({
  atlas: NonEmptyStringSchema,
  width: NonNegativeIntSchema,
  height: NonNegativeIntSchema,
  mime: z.string().optional(),
  sha256: z.string().optional(),
  byteSize: NonNegativeIntSchema.optional(),
});

export type AtlasSummary = z.infer<typeof AtlasSummarySchema>;

export const ProductionManifestSchema = z.object({
  protocolVersion: z.number().int().positive(),
  manifestVersion: z.number().int().positive(),
  visualRevision: NonEmptyStringSchema,
  status: NonEmptyStringSchema,
  theme: z.string(),
  productionRoot: NonEmptyStringSchema,
  runtimeRoot: NonEmptyStringSchema,
  individualSourcePackage: z.string().optional(),
  assetCount: NonNegativeIntSchema,
  assets: z.array(ProductionAssetSchema).min(1),
  atlas: z.record(z.string(), AtlasSummarySchema),
  rules: z.array(z.string()),
});

export type ProductionManifest = z.infer<typeof ProductionManifestSchema>;

// ── Runtime atlas metadata (`runtime/<name>.json`) ────────────────────────────────────────────

export const AtlasFrameSchema = z.object({
  x: NonNegativeIntSchema,
  y: NonNegativeIntSchema,
  w: NonNegativeIntSchema,
  h: NonNegativeIntSchema,
  pivot: PivotSchema.optional(),
});

export type AtlasFrame = z.infer<typeof AtlasFrameSchema>;

export const AtlasMetaSchema = z.object({
  atlas: NonEmptyStringSchema,
  width: NonNegativeIntSchema,
  height: NonNegativeIntSchema,
  mime: z.string().optional(),
  sha256: z.string().optional(),
  byteSize: NonNegativeIntSchema.optional(),
  frames: z.record(z.string(), AtlasFrameSchema),
});

export type AtlasMeta = z.infer<typeof AtlasMetaSchema>;

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: string[] };

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.map((part) => String(part)).join('.') || '<root>'}: ${issue.message}`,
  );
}

export function parseProductionManifest(input: unknown): ParseResult<ProductionManifest> {
  const parsed = ProductionManifestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };

  const manifest = parsed.data;
  const errors: string[] = [];

  // Cross-field checks the schema alone cannot express.
  if (manifest.assets.length !== manifest.assetCount) {
    errors.push(
      `assetCount ${manifest.assetCount} does not match ${manifest.assets.length} assets`,
    );
  }

  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    if (seen.has(asset.id)) errors.push(`duplicate asset id "${asset.id}"`);
    seen.add(asset.id);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: manifest };
}

export function parseAtlasMeta(input: unknown): ParseResult<AtlasMeta> {
  const parsed = AtlasMetaSchema.safeParse(input);

  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, errors: formatIssues(parsed.error) };
}
