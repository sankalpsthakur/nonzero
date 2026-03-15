import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a daily instrument sync operation. */
export interface SyncResult {
  workspaceId: string;
  added: number;
  updated: number;
  removed: number;
  expiryAware: number;
  totalInstruments: number;
  syncedAt: Date;
  durationMs: number;
}

/** Raw instrument record from the Kite instrument dump. */
interface KiteInstrument {
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name: string;
  last_price: number;
  expiry: string;
  strike: number;
  tick_size: number;
  lot_size: number;
  instrument_type: string;
  segment: string;
  exchange: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KITE_INSTRUMENTS_URL = "https://api.kite.trade/instruments";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Downloads the Kite instrument dump CSV and parses it into typed records.
 *
 * The Kite instruments endpoint returns a CSV file with columns:
 * instrument_token, exchange_token, tradingsymbol, name, last_price,
 * expiry, strike, tick_size, lot_size, instrument_type, segment, exchange
 */
async function downloadInstrumentDump(): Promise<KiteInstrument[]> {
  const response = await fetch(KITE_INSTRUMENTS_URL);

  if (!response.ok) {
    throw new Error(
      `Failed to download instruments: ${response.status} ${response.statusText}`,
    );
  }

  const csvText = await response.text();
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    throw new Error("Instrument dump is empty or malformed");
  }

  // First line is the header
  const headers = lines[0].split(",");
  const instruments: KiteInstrument[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    if (values.length !== headers.length) continue;

    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h.trim()] = values[idx]?.trim() ?? "";
    });

    instruments.push({
      instrument_token: parseInt(record.instrument_token, 10) || 0,
      exchange_token: parseInt(record.exchange_token, 10) || 0,
      tradingsymbol: record.tradingsymbol ?? "",
      name: record.name ?? "",
      last_price: parseFloat(record.last_price) || 0,
      expiry: record.expiry ?? "",
      strike: parseFloat(record.strike) || 0,
      tick_size: parseFloat(record.tick_size) || 0,
      lot_size: parseInt(record.lot_size, 10) || 1,
      instrument_type: record.instrument_type ?? "",
      segment: record.segment ?? "",
      exchange: record.exchange ?? "",
    });
  }

  return instruments;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Daily instrument sync job.
 *
 * Downloads the full Kite instrument dump (~80k instruments) and upserts
 * them into the SymbolMaster table for the given workspace. Tracks
 * expiry-aware instruments (futures, options) separately for downstream
 * roll handling.
 *
 * Intended to run daily at ~08:30 AM IST, before market open.
 *
 * @param workspaceId - The workspace whose symbol master to update.
 * @returns Sync statistics: added, updated, removed counts.
 */
export async function syncInstruments(
  workspaceId: string,
): Promise<SyncResult> {
  const startTime = Date.now();
  const syncedAt = new Date();

  // Verify workspace exists
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  // Download the full instrument dump from Kite
  const instruments = await downloadInstrumentDump();

  // Get existing symbols for this workspace
  const existing = await db.symbolMaster.findMany({
    where: { workspaceId },
    select: { id: true, exchange: true, tradingSymbol: true },
  });

  const existingMap = new Map(
    existing.map((s) => [`${s.exchange}:${s.tradingSymbol}`, s.id]),
  );

  let added = 0;
  let updated = 0;
  let expiryAware = 0;

  // Upsert instruments in batches
  const BATCH_SIZE = 500;

  for (let i = 0; i < instruments.length; i += BATCH_SIZE) {
    const batch = instruments.slice(i, i + BATCH_SIZE);

    await db.$transaction(
      batch.map((inst) => {
        const key = `${inst.exchange}:${inst.tradingsymbol}`;
        const expiry = inst.expiry ? new Date(inst.expiry) : null;

        if (expiry && !isNaN(expiry.getTime())) {
          expiryAware++;
        }

        const data = {
          workspaceId,
          exchange: inst.exchange,
          tradingSymbol: inst.tradingsymbol,
          name: inst.name || inst.tradingsymbol,
          instrumentToken: inst.instrument_token,
          lotSize: inst.lot_size,
          instrumentType: inst.instrument_type,
          expiry,
          lastSyncedAt: syncedAt,
        };

        if (existingMap.has(key)) {
          updated++;
          return db.symbolMaster.update({
            where: { id: existingMap.get(key)! },
            data: {
              name: data.name,
              instrumentToken: data.instrumentToken,
              lotSize: data.lotSize,
              instrumentType: data.instrumentType,
              expiry: data.expiry,
              lastSyncedAt: data.lastSyncedAt,
            },
          });
        } else {
          added++;
          return db.symbolMaster.create({ data });
        }
      }),
    );
  }

  // Remove instruments that are no longer in the dump
  // (only those that were synced before and are now absent)
  const currentKeys = new Set(
    instruments.map((inst) => `${inst.exchange}:${inst.tradingsymbol}`),
  );

  const toRemove = existing.filter(
    (s) => !currentKeys.has(`${s.exchange}:${s.tradingSymbol}`),
  );

  if (toRemove.length > 0) {
    await db.symbolMaster.deleteMany({
      where: {
        id: { in: toRemove.map((s) => s.id) },
      },
    });
  }

  const durationMs = Date.now() - startTime;

  const result: SyncResult = {
    workspaceId,
    added,
    updated,
    removed: toRemove.length,
    expiryAware,
    totalInstruments: instruments.length,
    syncedAt,
    durationMs,
  };

  console.log(
    `[instrument-sync] workspace=${workspaceId} added=${added} updated=${updated} removed=${toRemove.length} total=${instruments.length} duration=${durationMs}ms`,
  );

  return result;
}
