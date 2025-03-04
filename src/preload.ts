import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('data', {
	getAlbum: (id: number) => ipcRenderer.invoke('get-album', id),
	getAlbums: () => ipcRenderer.invoke('get-albums'),
	getPicture: (path: string) => ipcRenderer.invoke('get-picture', path),
	getSong: (data: { albumId: number; songId: number }) => ipcRenderer.invoke('get-song', data),
	getSongBase64: (data: { albumId: number; songId: number }) => ipcRenderer.invoke('get-song-base64', data),
	getMetadata: (data: { albumId: number; songId: number }) => ipcRenderer.invoke('get-metadata', data),
});

contextBridge.exposeInMainWorld('electron', {
	moveToView: (view: string, params: string) => ipcRenderer.send('move-to-view', view, params),
});
