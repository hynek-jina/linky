import { CZECH_FIRST_NAMES, ENGLISH_FIRST_NAMES } from "./firstNames";
import type { Lang } from "./i18n";

export type DerivedProfileDefaults = {
  lnAddress: string;
  name: string;
  pictureUrl: string;
};

export const DEFAULT_LIGHTNING_ADDRESS_DOMAIN = "linky.fit";

export type AvatarEditorControlId =
  | "top"
  | "hairColor"
  | "accessories"
  | "face"
  | "mouth"
  | "facialHair"
  | "skin"
  | "clothing";

export interface AvatarEditorControl {
  id: AvatarEditorControlId;
  label: string;
}

export interface DerivedAvatarSelection {
  accessoriesIndex: number;
  clothingIndex: number;
  faceIndex: number;
  facialHairIndex: number;
  hairColorIndex: number;
  mouthIndex: number;
  seed: string;
  skinIndex: number;
  topIndex: number;
}

export interface DerivedGeneratedAvatar {
  pictureUrl: string;
  selection: DerivedAvatarSelection;
}

type AccessoriesPreset = {
  accessories: string;
  accessoriesColor: string;
  accessoriesProbability: number;
};

type FacePreset = {
  eyebrows: string;
  eyes: string;
};

type MouthPreset = {
  mouth: string;
};

type FacialHairPreset = {
  facialHair: string;
  facialHairProbability: number;
};

type SkinPreset = {
  skinColor: string;
};

type ClothingPreset = {
  clothesColor: string;
  clothing: string;
  clothingGraphic: string;
};

// Simple deterministic hash (FNV-1a 32-bit) that works synchronously in the browser.
const hash32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (via shifts to stay in 32-bit)
    hash =
      (hash +
        ((hash << 1) >>> 0) +
        ((hash << 4) >>> 0) +
        ((hash << 7) >>> 0) +
        ((hash << 8) >>> 0) +
        ((hash << 24) >>> 0)) >>
      0;
  }
  return hash >>> 0;
};

const normalizeSeed = (seedValue: string): string => {
  return String(seedValue ?? "").trim() || "linky";
};

const HAIR_TOP_VALUES: readonly string[] = [
  "bob",
  "bun",
  "curly",
  "curvy",
  "dreads",
  "frida",
  "fro",
  "froBand",
  "longButNotTooLong",
  "miaWallace",
  "shavedSides",
  "straight02",
  "straight01",
  "straightAndStrand",
  "dreads01",
  "dreads02",
  "frizzle",
  "shaggy",
  "shaggyMullet",
  "shortCurly",
  "shortFlat",
  "shortRound",
  "shortWaved",
  "sides",
  "theCaesar",
  "theCaesarAndSidePart",
  "bigHair",
];

const HAT_TOP_VALUES: readonly string[] = [
  "hat",
  "hijab",
  "turban",
  "winterHat1",
  "winterHat02",
  "winterHat03",
  "winterHat04",
];

const TOP_VALUES: readonly string[] = [...HAIR_TOP_VALUES, ...HAT_TOP_VALUES];

const HAIR_COLOR_VALUES: readonly string[] = [
  "a55728",
  "2c1b18",
  "b58143",
  "d6b370",
  "724133",
  "4a312c",
  "f59797",
  "ecdcbf",
  "c93305",
  "e8e1e1",
];

const HAT_COLOR_VALUES: readonly string[] = [
  "262e33",
  "65c9ff",
  "5199e4",
  "25557c",
  "e6e6e6",
  "929598",
  "3c4f5c",
  "b1e2ff",
  "a7ffc4",
  "ffdeb5",
  "ffafb9",
  "ffffb1",
  "ff488e",
  "ff5c5c",
  "ffffff",
];

const ACCESSORIES_VALUES: readonly string[] = [
  "kurt",
  "prescription01",
  "prescription02",
  "round",
  "sunglasses",
  "wayfarers",
  "eyepatch",
];

const ACCESSORIES_COLOR_VALUES: readonly string[] = [
  "262e33",
  "65c9ff",
  "5199e4",
  "25557c",
  "e6e6e6",
  "929598",
  "3c4f5c",
  "b1e2ff",
  "a7ffc4",
  "ffdeb5",
  "ffafb9",
  "ffffb1",
  "ff488e",
  "ff5c5c",
  "ffffff",
];

const ACCESSORIES_SLOT_COUNT = ACCESSORIES_VALUES.length + 1;

const EYEBROWS_VALUES: readonly string[] = [
  "angryNatural",
  "defaultNatural",
  "flatNatural",
  "frownNatural",
  "raisedExcitedNatural",
  "sadConcernedNatural",
  "unibrowNatural",
  "upDownNatural",
  "angry",
  "default",
  "raisedExcited",
  "sadConcerned",
  "upDown",
];

const EYES_VALUES: readonly string[] = [
  "closed",
  "cry",
  "default",
  "eyeRoll",
  "happy",
  "hearts",
  "side",
  "squint",
  "surprised",
  "winkWacky",
  "wink",
  "xDizzy",
];

const MOUTH_VALUES: readonly string[] = [
  "concerned",
  "default",
  "disbelief",
  "eating",
  "grimace",
  "sad",
  "screamOpen",
  "serious",
  "smile",
  "tongue",
  "twinkle",
  "vomit",
];

const FACIAL_HAIR_VALUES: readonly string[] = [
  "beardLight",
  "beardMajestic",
  "beardMedium",
  "moustacheFancy",
  "moustacheMagnum",
];

const FACIAL_HAIR_PROBABILITY_VALUES: readonly number[] = [0, 100];

const SKIN_COLOR_VALUES: readonly string[] = [
  "614335",
  "d08b5b",
  "ae5d29",
  "edb98a",
  "ffdbb4",
  "fd9841",
  "f8d25c",
];

const CLOTHES_COLOR_VALUES: readonly string[] = [
  "262e33",
  "65c9ff",
  "5199e4",
  "25557c",
  "e6e6e6",
  "929598",
  "3c4f5c",
  "b1e2ff",
  "a7ffc4",
  "ffafb9",
  "ffffb1",
  "ff488e",
  "ff5c5c",
  "ffffff",
];

const CLOTHING_VALUES: readonly string[] = [
  "blazerAndShirt",
  "blazerAndSweater",
  "collarAndSweater",
  "graphicShirt",
  "hoodie",
  "overall",
  "shirtCrewNeck",
  "shirtScoopNeck",
  "shirtVNeck",
];

const CLOTHING_GRAPHIC_VALUES: readonly string[] = [
  "bat",
  "bear",
  "cumbia",
  "deer",
  "diamond",
  "hola",
  "pizza",
  "resist",
  "skull",
  "skullOutline",
];

export const AVATAR_EDITOR_CONTROLS: readonly AvatarEditorControl[] = [
  { id: "top", label: "Top" },
  { id: "hairColor", label: "Hair color" },
  { id: "accessories", label: "Accessories" },
  { id: "face", label: "Eyes" },
  { id: "mouth", label: "Mouth" },
  { id: "facialHair", label: "Beard" },
  { id: "skin", label: "Skin" },
  { id: "clothing", label: "Clothes" },
];

const normalizeIndex = (value: number, max: number): number => {
  if (max <= 0) return 0;
  return ((Math.trunc(value) % max) + max) % max;
};

const pickIndexedValue = <T>(
  values: readonly T[],
  index: number,
): T | undefined => {
  return values[normalizeIndex(index, values.length)];
};

const nextPseudoRandomIndex = (
  seed: string,
  scope: string,
  currentIndex: number,
  total: number,
): number => {
  if (total <= 1) return 0;

  const current = normalizeIndex(currentIndex, total);
  const candidate =
    hash32(`${normalizeSeed(seed)}:${scope}:${current + 1}`) % total;

  return candidate === current ? (candidate + 1) % total : candidate;
};

const getCombinationSize = (dimensions: readonly number[]): number => {
  return dimensions.reduce((size, length) => size * Math.max(length, 1), 1);
};

const splitCombinationIndex = (
  value: number,
  dimensions: readonly number[],
): readonly number[] => {
  const totalSize = getCombinationSize(dimensions);
  let remaining = normalizeIndex(value, totalSize);
  const indexes = Array.from({ length: dimensions.length }, () => 0);

  for (let index = dimensions.length - 1; index >= 0; index -= 1) {
    const length = Math.max(dimensions[index] ?? 1, 1);
    indexes[index] = remaining % length;
    remaining = Math.floor(remaining / length);
  }

  return indexes;
};

const ACCESSORIES_DIMENSIONS = [
  ACCESSORIES_COLOR_VALUES.length,
  ACCESSORIES_SLOT_COUNT,
] as const;

const FACE_DIMENSIONS = [EYEBROWS_VALUES.length, EYES_VALUES.length] as const;

const FACIAL_HAIR_DIMENSIONS = [
  FACIAL_HAIR_PROBABILITY_VALUES.length,
  FACIAL_HAIR_VALUES.length,
] as const;
const FACIAL_HAIR_VISIBLE_OFFSET = FACIAL_HAIR_VALUES.length;

const CLOTHING_DIMENSIONS = [
  CLOTHING_VALUES.length,
  CLOTHES_COLOR_VALUES.length,
  CLOTHING_GRAPHIC_VALUES.length,
] as const;

const buildAvatarUrl = (selection: DerivedAvatarSelection): string => {
  const top = pickIndexedValue(TOP_VALUES, selection.topIndex);
  const hairColor = pickIndexedValue(
    HAIR_COLOR_VALUES,
    selection.hairColorIndex,
  );
  const hatColor = pickIndexedValue(HAT_COLOR_VALUES, selection.topIndex);

  const [accessoriesColorIndex, accessoriesSlotIndex] = splitCombinationIndex(
    selection.accessoriesIndex,
    ACCESSORIES_DIMENSIONS,
  );
  const accessoriesAreVisible =
    (accessoriesSlotIndex ?? 0) < ACCESSORIES_VALUES.length;
  const accessories: AccessoriesPreset = {
    accessories:
      pickIndexedValue(ACCESSORIES_VALUES, accessoriesSlotIndex ?? 0) ??
      ACCESSORIES_VALUES[0] ??
      "round",
    accessoriesColor:
      pickIndexedValue(ACCESSORIES_COLOR_VALUES, accessoriesColorIndex ?? 0) ??
      "262e33",
    accessoriesProbability: accessoriesAreVisible ? 100 : 0,
  };

  const [eyebrowsIndex, eyesIndex] = splitCombinationIndex(
    selection.faceIndex,
    FACE_DIMENSIONS,
  );
  const face: FacePreset = {
    eyebrows:
      EYEBROWS_VALUES[
        normalizeIndex(eyebrowsIndex ?? 0, EYEBROWS_VALUES.length)
      ] ??
      EYEBROWS_VALUES[0] ??
      "default",
    eyes:
      EYES_VALUES[normalizeIndex(eyesIndex ?? 0, EYES_VALUES.length)] ??
      EYES_VALUES[0] ??
      "default",
  };

  const mouth: MouthPreset = {
    mouth: pickIndexedValue(MOUTH_VALUES, selection.mouthIndex) ?? "smile",
  };

  const [facialHairProbabilityIndex, facialHairIndex] = splitCombinationIndex(
    selection.facialHairIndex,
    FACIAL_HAIR_DIMENSIONS,
  );
  const facialHair: FacialHairPreset = {
    facialHair:
      pickIndexedValue(FACIAL_HAIR_VALUES, facialHairIndex ?? 0) ??
      "beardLight",
    facialHairProbability:
      pickIndexedValue(
        FACIAL_HAIR_PROBABILITY_VALUES,
        facialHairProbabilityIndex ?? 0,
      ) ?? 0,
  };

  const skin: SkinPreset = {
    skinColor:
      pickIndexedValue(SKIN_COLOR_VALUES, selection.skinIndex) ?? "614335",
  };

  const [clothingIndex, clothesColorIndex, clothingGraphicIndex] =
    splitCombinationIndex(selection.clothingIndex, CLOTHING_DIMENSIONS);
  const clothing: ClothingPreset = {
    clothing: pickIndexedValue(CLOTHING_VALUES, clothingIndex ?? 0) ?? "hoodie",
    clothesColor:
      pickIndexedValue(CLOTHES_COLOR_VALUES, clothesColorIndex ?? 0) ??
      "262e33",
    clothingGraphic:
      pickIndexedValue(CLOTHING_GRAPHIC_VALUES, clothingGraphicIndex ?? 0) ??
      "bat",
  };

  const params = new URLSearchParams();
  params.set("seed", normalizeSeed(selection.seed));
  params.set("top", top ?? TOP_VALUES[0] ?? "shortWaved");
  params.set("hairColor", hairColor ?? HAIR_COLOR_VALUES[0] ?? "2c1b18");
  params.set("hatColor", hatColor ?? HAT_COLOR_VALUES[0] ?? "3c4f5c");
  params.set(
    "accessories",
    accessories?.accessories ?? ACCESSORIES_VALUES[0] ?? "round",
  );
  params.set(
    "accessoriesColor",
    accessories?.accessoriesColor ?? ACCESSORIES_COLOR_VALUES[0] ?? "3c4f5c",
  );
  params.set(
    "accessoriesProbability",
    String(accessories?.accessoriesProbability ?? 0),
  );
  params.set("eyebrows", face?.eyebrows ?? EYEBROWS_VALUES[0] ?? "default");
  params.set("eyes", face?.eyes ?? EYES_VALUES[0] ?? "default");
  params.set("mouth", mouth?.mouth ?? MOUTH_VALUES[0] ?? "smile");
  params.set(
    "facialHair",
    facialHair?.facialHair ?? FACIAL_HAIR_VALUES[0] ?? "beardLight",
  );
  params.set("facialHairColor", hairColor ?? HAIR_COLOR_VALUES[0] ?? "2c1b18");
  params.set(
    "facialHairProbability",
    String(facialHair?.facialHairProbability ?? 0),
  );
  params.set("skinColor", skin?.skinColor ?? SKIN_COLOR_VALUES[0] ?? "ffdbb4");
  params.set("clothing", clothing?.clothing ?? CLOTHING_VALUES[0] ?? "hoodie");
  params.set(
    "clothesColor",
    clothing?.clothesColor ?? CLOTHES_COLOR_VALUES[0] ?? "3c4f5c",
  );
  params.set(
    "clothingGraphic",
    clothing?.clothingGraphic ?? CLOTHING_GRAPHIC_VALUES[0] ?? "skullOutline",
  );

  return `https://api.dicebear.com/9.x/avataaars/svg?${params.toString()}`;
};

export const deriveInitialAvatarSelection = (
  seedSource: string,
): DerivedAvatarSelection => {
  const seed = normalizeSeed(seedSource);
  const initialFacialHairIndex =
    hash32(`${seed}:facialHair`) % FACIAL_HAIR_VALUES.length;

  return {
    accessoriesIndex:
      hash32(`${seed}:accessories`) %
      getCombinationSize(ACCESSORIES_DIMENSIONS),
    clothingIndex:
      hash32(`${seed}:clothing`) % getCombinationSize(CLOTHING_DIMENSIONS),
    faceIndex: hash32(`${seed}:face`) % getCombinationSize(FACE_DIMENSIONS),
    facialHairIndex: initialFacialHairIndex,
    hairColorIndex: hash32(`${seed}:hairColor`) % HAIR_COLOR_VALUES.length,
    mouthIndex: hash32(`${seed}:mouth`) % MOUTH_VALUES.length,
    seed,
    skinIndex: hash32(`${seed}:skin`) % SKIN_COLOR_VALUES.length,
    topIndex: hash32(`${seed}:top`) % TOP_VALUES.length,
  };
};

export const deriveGeneratedAvatar = (
  seedSource: string,
  selection: DerivedAvatarSelection = deriveInitialAvatarSelection(seedSource),
): DerivedGeneratedAvatar => {
  const normalizedSelection: DerivedAvatarSelection = {
    accessoriesIndex: normalizeIndex(
      selection.accessoriesIndex,
      getCombinationSize(ACCESSORIES_DIMENSIONS),
    ),
    clothingIndex: normalizeIndex(
      selection.clothingIndex,
      getCombinationSize(CLOTHING_DIMENSIONS),
    ),
    faceIndex: normalizeIndex(
      selection.faceIndex,
      getCombinationSize(FACE_DIMENSIONS),
    ),
    facialHairIndex: normalizeIndex(
      selection.facialHairIndex,
      getCombinationSize(FACIAL_HAIR_DIMENSIONS),
    ),
    hairColorIndex: normalizeIndex(
      selection.hairColorIndex,
      HAIR_COLOR_VALUES.length,
    ),
    mouthIndex: normalizeIndex(selection.mouthIndex, MOUTH_VALUES.length),
    seed: normalizeSeed(selection.seed || seedSource),
    skinIndex: normalizeIndex(selection.skinIndex, SKIN_COLOR_VALUES.length),
    topIndex: normalizeIndex(selection.topIndex, TOP_VALUES.length),
  };

  return {
    pictureUrl: buildAvatarUrl(normalizedSelection),
    selection: normalizedSelection,
  };
};

export const cycleGeneratedAvatar = (
  current: DerivedAvatarSelection,
  controlId: AvatarEditorControlId,
): DerivedGeneratedAvatar => {
  const [facialHairProbabilityIndex, facialHairIndex] = splitCombinationIndex(
    current.facialHairIndex,
    FACIAL_HAIR_DIMENSIONS,
  );
  const nextFacialHairIndex =
    pickIndexedValue(
      FACIAL_HAIR_PROBABILITY_VALUES,
      facialHairProbabilityIndex ?? 0,
    ) === 0
      ? FACIAL_HAIR_VISIBLE_OFFSET +
        normalizeIndex(facialHairIndex ?? 0, FACIAL_HAIR_VALUES.length)
      : current.facialHairIndex + 1;

  const nextSelection: DerivedAvatarSelection = {
    ...current,
    accessoriesIndex:
      controlId === "accessories"
        ? current.accessoriesIndex + 1
        : current.accessoriesIndex,
    clothingIndex:
      controlId === "clothing"
        ? nextPseudoRandomIndex(
            current.seed,
            "clothing",
            current.clothingIndex,
            getCombinationSize(CLOTHING_DIMENSIONS),
          )
        : current.clothingIndex,
    faceIndex: controlId === "face" ? current.faceIndex + 1 : current.faceIndex,
    facialHairIndex:
      controlId === "facialHair"
        ? nextFacialHairIndex
        : current.facialHairIndex,
    hairColorIndex:
      controlId === "hairColor"
        ? current.hairColorIndex + 1
        : current.hairColorIndex,
    mouthIndex:
      controlId === "mouth" ? current.mouthIndex + 1 : current.mouthIndex,
    seed: normalizeSeed(current.seed),
    skinIndex: controlId === "skin" ? current.skinIndex + 1 : current.skinIndex,
    topIndex: controlId === "top" ? current.topIndex + 1 : current.topIndex,
  };

  return deriveGeneratedAvatar(nextSelection.seed, nextSelection);
};

const pickDeterministicName = (npub: string, lang: Lang): string => {
  const key = String(npub ?? "").trim();
  const list = lang === "cs" ? CZECH_FIRST_NAMES : ENGLISH_FIRST_NAMES;
  if (!key) return list[0] ?? "Linky";
  if (!list.length) return "Linky";
  const idx = hash32(key) % list.length;
  return list[idx] ?? list[0] ?? "Linky";
};

const dicebearAvataaarsUrlForNpub = (npub: string): string => {
  return deriveGeneratedAvatar(npub).pictureUrl;
};

export const deriveDefaultLightningAddress = (npub: string): string => {
  const normalized = String(npub ?? "").trim();
  return normalized ? `${normalized}@${DEFAULT_LIGHTNING_ADDRESS_DOMAIN}` : "";
};

export const parseDefaultLightningAddressNpub = (
  lightningAddress: string,
): string | null => {
  const normalized = String(lightningAddress ?? "").trim();
  const suffix = `@${DEFAULT_LIGHTNING_ADDRESS_DOMAIN}`;
  if (!normalized.toLowerCase().endsWith(suffix)) return null;
  const npub = normalized.slice(0, -suffix.length).trim();
  return npub || null;
};

export const deriveDefaultProfile = (
  npub: string,
  lang: Lang = "en",
): DerivedProfileDefaults => {
  const normalized = String(npub ?? "").trim();
  const name = pickDeterministicName(normalized, lang);
  const pictureUrl = dicebearAvataaarsUrlForNpub(normalized);
  const lnAddress = deriveDefaultLightningAddress(normalized);
  return { name, lnAddress, pictureUrl };
};
