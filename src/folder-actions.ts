import type { Folder, Resource } from './model';

type FolderWorkspace = { folders: Folder[]; resources: Resource[] };
export type FolderDeletion = {
  folder: Folder; index: number; destinationParent: string | null;
  childFolderIds: string[]; resourceIds: string[];
};

/** Iterative traversal keeps deeply nested or damaged folder trees from recursing forever. */
export function folderDescendants(folders: Folder[], id: string): string[] {
  const children = new Map<string, string[]>();
  for (const folder of folders) if (folder.parent) {
    const siblings = children.get(folder.parent);
    if (siblings) siblings.push(folder.id); else children.set(folder.parent, [folder.id]);
  }
  const result: string[] = [], seen = new Set<string>(), queue = [id];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (seen.has(current)) continue;
    seen.add(current); result.push(current);
    for (const child of children.get(current) || []) queue.push(child);
  }
  return result;
}

function safeParent(folders: Folder[], parent: string | null, excluded: string): string | null {
  if (!parent) return null;
  const byId = new Map(folders.map(folder => [folder.id, folder])), seen = new Set<string>();
  let current: string | null = parent;
  while (current) {
    if (current === excluded || seen.has(current)) return null;
    seen.add(current);
    const folder = byId.get(current);
    if (!folder) return null;
    current = folder.parent;
  }
  return parent;
}

/** Removes one folder. Direct children move one level up; files and nested descendants are retained. */
export function deleteFolderKeepingMaterials<T extends FolderWorkspace>(state: T, id: string): { state: T; deletion: FolderDeletion | null } {
  const index = state.folders.findIndex(folder => folder.id === id);
  if (index < 0) return { state, deletion: null };
  const folder = state.folders[index], destinationParent = safeParent(state.folders, folder.parent, id);
  const deletion: FolderDeletion = { folder: { ...folder }, index, destinationParent,
    childFolderIds: state.folders.filter(child => child.id !== id && child.parent === id).map(child => child.id),
    resourceIds: state.resources.filter(resource => resource.folder === id).map(resource => resource.id) };
  const folders = state.folders.filter(item => item.id !== id).map(item => item.parent === id ? { ...item, parent: destinationParent } : item);
  // A new resources identity also requests mastery recalculation after a folder-only hierarchy change.
  const resources = state.resources.map(resource => resource.folder === id ? { ...resource, folder: destinationParent || '' } : resource);
  return { state: { ...state, folders, resources }, deletion };
}

/** Undo changes locations only while they still match this deletion's destination. Later edits survive. */
export function restoreDeletedFolder<T extends FolderWorkspace>(state: T, deletion: FolderDeletion): T {
  if (state.folders.some(folder => folder.id === deletion.folder.id)) return state;
  const restored = { ...deletion.folder, parent: safeParent(state.folders, deletion.folder.parent, deletion.folder.id) };
  const folders = [...state.folders];
  folders.splice(Math.min(deletion.index, folders.length), 0, restored);
  const movedChildren = new Set(deletion.childFolderIds), movedResources = new Set(deletion.resourceIds);
  const updatedFolders = folders.map(folder => {
    if (!movedChildren.has(folder.id) || folder.parent !== deletion.destinationParent) return folder;
    // A later hierarchy edit must never turn Undo into a cycle.
    if (safeParent(folders, restored.id, folder.id) !== restored.id) return folder;
    return { ...folder, parent: restored.id };
  });
  const resources = state.resources.map(resource => movedResources.has(resource.id) && resource.folder === (deletion.destinationParent || '') ? { ...resource, folder: restored.id } : resource);
  return { ...state, folders: updatedFolders, resources };
}
