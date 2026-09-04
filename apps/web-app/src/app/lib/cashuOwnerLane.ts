import * as Evolu from "@evolu/common";
import type { CashuTokenRow } from "../../evolu";

type CashuOwnerRow = Pick<CashuTokenRow, "ownerId">;

export const readCashuRowOwnerId = (row: CashuOwnerRow): string =>
  String(row.ownerId);

export const resolveCashuRowStoredOwnerLane = (
  row: CashuOwnerRow | null | undefined,
): Evolu.OwnerId | null => row?.ownerId ?? null;
