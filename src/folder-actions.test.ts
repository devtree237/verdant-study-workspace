import { describe, expect, it } from 'vitest';
import type { Folder, Resource } from './model';
import { deleteFolderKeepingMaterials, folderDescendants, restoreDeletedFolder } from './folder-actions';

const folder = (id: string, parent: string | null = null): Folder => ({ id, name: id, parent, subject: 'subject', pinned: false, mastery: 25 });
const resource = (id: string, location: string): Resource => ({ id, title: id, folder: location, subject: 'subject', type: 'PDF', content: 'My notes', fileKey: `file-${id}`, mastery: 60, pinned: false, updated: '2026-10-24' });

describe('deleting one folder while retaining its materials', () => {
  it('moves root materials to Unfiled and direct child folders to root, preserving nested content and file keys', () => {
    const state = { folders: [folder('root'), folder('child', 'root'), folder('grandchild', 'child')], resources: [resource('direct', 'root'), resource('nested', 'grandchild')] };
    const removed = deleteFolderKeepingMaterials(state, 'root');
    expect(removed.state.folders).toEqual([folder('child'), folder('grandchild', 'child')]);
    expect(removed.state.resources[0]).toEqual({ ...state.resources[0], folder: '' });
    expect(removed.state.resources[1]).toBe(state.resources[1]);
    expect(removed.state.resources.map(item => item.fileKey)).toEqual(['file-direct', 'file-nested']);
    expect(state.folders[0].id).toBe('root');
    expect(restoreDeletedFolder(removed.state, removed.deletion!)).toEqual(state);
  });
  it('moves only direct contents to the parent when deleting a nested folder', () => {
    const state = { folders: [folder('parent'), folder('delete', 'parent'), folder('child', 'delete'), folder('grandchild', 'child')], resources: [resource('parent-material', 'parent'), resource('direct', 'delete'), resource('nested', 'child')] };
    const { state: next, deletion } = deleteFolderKeepingMaterials(state, 'delete');
    expect(next.folders.find(item => item.id === 'child')?.parent).toBe('parent');
    expect(next.folders.find(item => item.id === 'grandchild')?.parent).toBe('child');
    expect(next.resources.map(item => item.folder)).toEqual(['parent', 'parent', 'child']);
    expect(deletion?.resourceIds).toEqual(['direct']);
    expect(restoreDeletedFolder(next, deletion!)).toEqual(state);
  });
  it('recalculates mastery after a folder-only move and treats missing folders as a no-op', () => {
    const state = { folders: [folder('root'), folder('child', 'root')], resources: [resource('nested', 'child')] };
    const removed = deleteFolderKeepingMaterials(state, 'root');
    expect(removed.state.resources).not.toBe(state.resources);
    expect(removed.state.resources[0]).toBe(state.resources[0]);
    expect(deleteFolderKeepingMaterials(state, 'missing')).toEqual({ state, deletion: null });
  });
});

describe('non-destructive folder Undo', () => {
  it('restores locations while retaining later content, mastery, names and newly created items', () => {
    const original = { folders: [folder('root'), folder('child', 'root'), folder('other')], resources: [resource('direct', 'root'), resource('moved-later', 'root')] };
    const { state, deletion } = deleteFolderKeepingMaterials(original, 'root');
    const later = { folders: [...state.folders.map(item => item.id === 'child' ? { ...item, name: 'Renamed child', pinned: true } : item), folder('new')], resources: [...state.resources.map(item => item.id === 'direct' ? { ...item, content: 'Later study notes', mastery: 100 } : { ...item, folder: 'other' }), resource('new-material', '')] };
    const restored = restoreDeletedFolder(later, deletion!);
    expect(restored.resources.find(item => item.id === 'direct')).toMatchObject({ folder: 'root', content: 'Later study notes', mastery: 100, fileKey: 'file-direct' });
    expect(restored.resources.find(item => item.id === 'moved-later')?.folder).toBe('other');
    expect(restored.resources.find(item => item.id === 'new-material')?.folder).toBe('');
    expect(restored.folders.find(item => item.id === 'child')).toMatchObject({ parent: 'root', name: 'Renamed child', pinned: true });
    expect(restored.folders.some(item => item.id === 'new')).toBe(true);
    expect(restoreDeletedFolder(restored, deletion!)).toBe(restored);
  });
  it('does not resurrect later-deleted materials or move a child that was moved elsewhere', () => {
    const original = { folders: [folder('root'), folder('child', 'root'), folder('other')], resources: [resource('direct', 'root')] };
    const { state, deletion } = deleteFolderKeepingMaterials(original, 'root');
    const later = { folders: state.folders.map(item => item.id === 'child' ? { ...item, parent: 'other' } : item), resources: [] as Resource[] };
    const restored = restoreDeletedFolder(later, deletion!);
    expect(restored.resources).toEqual([]);
    expect(restored.folders.find(item => item.id === 'child')?.parent).toBe('other');
  });
  it('restores a folder at root if its former parent has since been deleted', () => {
    const original = { folders: [folder('parent'), folder('delete', 'parent')], resources: [resource('direct', 'delete')] };
    const removed = deleteFolderKeepingMaterials(original, 'delete');
    const parentRemoved = deleteFolderKeepingMaterials(removed.state, 'parent');
    const restored = restoreDeletedFolder(parentRemoved.state, removed.deletion!);
    expect(restored.folders.find(item => item.id === 'delete')?.parent).toBeNull();
    // Its material was subsequently moved by another deletion, so this Undo leaves that later move intact.
    expect(restored.resources[0].folder).toBe('');
  });
});

describe('safe folder traversal', () => {
  it('handles deep descendants and cycles without recursive calls or duplicated IDs', () => {
    const deep = Array.from({ length: 12000 }, (_, index) => folder(String(index), index ? String(index - 1) : null));
    expect(folderDescendants(deep, '0')).toHaveLength(12000);
    expect(folderDescendants([folder('a', 'b'), folder('b', 'a')], 'a')).toEqual(['a', 'b']);
    const corrupt = { folders: [folder('a', 'b'), folder('b', 'a')], resources: [resource('direct', 'a')] };
    const removed = deleteFolderKeepingMaterials(corrupt, 'a');
    expect(removed.state.folders).toEqual([folder('b')]);
    expect(removed.state.resources[0].folder).toBe('');
  });
});
