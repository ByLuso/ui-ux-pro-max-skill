import * as SQLite from "expo-sqlite";

export type Sighting = {
  id: number;
  speciesId: string | null;
  scientificName: string;
  commonName: string | null;
  confidence: number | null;
  photoUri: string;
  latitude: number | null;
  longitude: number | null;
  regionId: string | null;
  regionName: string | null;
  placeName: string | null;
  timestamp: number;
};

export type NewSighting = Omit<Sighting, "id">;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("floradex.db").then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS sightings (
          id INTEGER PRIMARY KEY NOT NULL,
          speciesId TEXT,
          scientificName TEXT NOT NULL,
          commonName TEXT,
          confidence REAL,
          photoUri TEXT NOT NULL,
          latitude REAL,
          longitude REAL,
          regionId TEXT,
          regionName TEXT,
          placeName TEXT,
          timestamp INTEGER NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

export async function insertSighting(sighting: NewSighting): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO sightings
      (speciesId, scientificName, commonName, confidence, photoUri, latitude, longitude, regionId, regionName, placeName, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sighting.speciesId,
    sighting.scientificName,
    sighting.commonName,
    sighting.confidence,
    sighting.photoUri,
    sighting.latitude,
    sighting.longitude,
    sighting.regionId,
    sighting.regionName,
    sighting.placeName,
    sighting.timestamp
  );
  return result.lastInsertRowId;
}

export async function getAllSightings(): Promise<Sighting[]> {
  const db = await getDb();
  return db.getAllAsync<Sighting>(`SELECT * FROM sightings ORDER BY timestamp DESC`);
}

export async function getSightingsForSpecies(speciesId: string): Promise<Sighting[]> {
  const db = await getDb();
  return db.getAllAsync<Sighting>(
    `SELECT * FROM sightings WHERE speciesId = ? ORDER BY timestamp DESC`,
    speciesId
  );
}

export async function getUnlockedSpeciesIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ speciesId: string }>(
    `SELECT DISTINCT speciesId FROM sightings WHERE speciesId IS NOT NULL`
  );
  return new Set(rows.map((r) => r.speciesId));
}

export async function deleteSighting(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sightings WHERE id = ?`, id);
}
