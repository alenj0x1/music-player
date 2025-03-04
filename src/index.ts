import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readdir, readFile } from 'fs/promises';
import * as mm from 'music-metadata';
import { extname, join } from 'path';
import { IAlbum, IPicture } from './interfaces';
import { Dirent } from 'fs';

const INDEX_VIEW = join(__dirname, '..', 'public/views', 'songs.html');
const PRELOAD_FILE = join(__dirname, 'preload.js');
const MUSIC_PATH = 'C:/Users/alenj0x1/TWICE/songs';
const FILES_SUPPORT = ['.png', '.jpg', 'jpeg', '.webp'];
const AUDIO_SUPPORT = ['.m4a', '.mp3', '.aac'];

let albumsData: IAlbum[] = [];

let win: BrowserWindow;
const createWindow = () => {
	win = new BrowserWindow({
		title: 'Music player',
		width: 400,
		height: 500,
		resizable: false,
		movable: true,
		webPreferences: {
			preload: PRELOAD_FILE,
		},
	});

	win.loadFile(INDEX_VIEW);
	Menu.setApplicationMenu(null);
};

app.on('ready', async () => {
	albumsData = (await searchSongs(MUSIC_PATH)).filter((album) => album.songs.length > 0);
	createWindow();
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-album', (_, id: number) => {
	return albumsData.find((album) => album.id === id);
});

ipcMain.handle('get-albums', () => {
	return albumsData;
});

ipcMain.handle('get-song', (_, { albumId, songId }: { albumId: number; songId: number }) => {
	try {
		const findAlbum = albumsData.find((album) => album.id === albumId);
		if (!findAlbum) throw new Error();

		const findSong = findAlbum.songs.find((song) => song.id === songId);
		if (!findSong) throw new Error();

		return findSong;
	} catch {
		return null;
	}
});

ipcMain.handle('get-song-base64', async (_, { albumId, songId }: { albumId: number; songId: number }) => {
	try {
		const findAlbum = albumsData.find((album) => album.id === albumId);
		if (!findAlbum) throw new Error();

		const findSong = findAlbum.songs.find((song) => song.id === songId);
		if (!findSong) throw new Error();

		const songBuffer = await readFile(findSong.completePath);
		const data = `data:audio/aac;base64,${songBuffer.toString('base64')}`;
		return data;
	} catch {
		return null;
	}
});

ipcMain.handle('get-picture', async (_, data: IPicture) => {
	try {
		if (data.isUrl) return data.completePath;

		const imageBuffer = await readFile(data.completePath);
		return `data:image/jpg;base64,${imageBuffer.toString('base64')}`;
	} catch {
		return null;
	}
});

ipcMain.handle('get-metadata', async (_, { albumId, songId }: { albumId: number; songId: number }) => {
	try {
		const findAlbum = albumsData.find((album) => album.id === albumId);
		if (!findAlbum) throw new Error();

		const findSong = findAlbum.songs.find((song) => song.id === songId);
		if (!findSong) throw new Error();

		return await mm.parseFile(findSong.completePath);
	} catch {
		return null;
	}
});

ipcMain.on('move-to-view', (_, view: string, params: string) => {
	win.loadURL(`file://${join(__dirname, '..', 'public/views', `${view}.html`)}?${params}`);
});

async function searchSongs(path: string, iterationCount: number = 1, songs: IAlbum[] = []) {
	let data: Dirent[] = [];

	try {
		data = await readdir(path, { withFileTypes: true });
	} catch (error) {
		return songs;
	}

	for (const element of data) {
		const extension = extname(element.name);

		if (element.isDirectory()) {
			songs.push({
				id: iterationCount,
				name: element.name,
				path,
				completePath: join(path, element.name),
				songs: [],
				picture: {
					name: '_',
					path: '_',
					completePath: 'https://shmector.com/_ph/3/350233005.png',
					isUrl: true,
				},
			});

			if (element.name.startsWith('.')) continue;

			await searchSongs(path + `/` + element.name, (iterationCount += 1), songs);
			continue;
		}

		if (!element.isFile()) continue;

		if (!FILES_SUPPORT.includes(extension) && !AUDIO_SUPPORT.includes(extension)) continue;

		const albumIndex = songs.findIndex((taka) => taka.id === iterationCount - 1);
		const album = songs[albumIndex];

		if (!album) continue;

		if (AUDIO_SUPPORT.includes(extension)) {
			album.songs.push({
				id: album.songs.length + 1,
				name: element.name,
				path,
				completePath: join(path, element.name),
			});
		} else {
			album.picture = {
				name: element.name,
				path,
				completePath: join(path, element.name),
				isUrl: false,
			};
		}

		songs[albumIndex] = album;
	}

	return songs;
}
