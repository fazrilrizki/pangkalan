export interface DirEntry {
  name: string;
  path: string;
}

/** One folder as shown by the add-project folder picker. Lists folders only, never files. */
export interface DirListing {
  path: string;
  /** null at a filesystem root. */
  parent: string | null;
  dirs: DirEntry[];
  /** Drive letters on Windows, `/` elsewhere. */
  roots: DirEntry[];
}
