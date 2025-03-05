import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { readdir, readFile, writeFile } from 'fs/promises';
import * as mm from 'music-metadata';
import { extname, join } from 'path';
import { IAlbum, IPicture } from './interfaces';
import { Dirent, existsSync } from 'fs';
import * as yaml from 'js-yaml';
import { loadEnvFile } from 'process';

const INDEX_VIEW = join(__dirname, '..', 'public/views', 'songs.html');
const PRELOAD_FILE = join(__dirname, 'preload.js');
const FILES_SUPPORT = ['.png', '.jpg', 'jpeg', '.webp'];
const AUDIO_SUPPORT = ['.m4a', '.mp3', '.aac'];
const DEFAULT_IMAGE = 'https://shmector.com/_ph/3/350233005.png';

let albumsData: IAlbum[] = [];
let songsMetadata: {
	songId: number;
	albumId: number;
	metadata: mm.IAudioMetadata;
}[] = [];

let configuration: Record<string, any>;
let musicPath = '';

if (existsSync('.env')) {
	loadEnvFile();
}

let win: BrowserWindow;
const createWindow = () => {
	win = new BrowserWindow({
		title: 'Music player',
		width: 465,
		minWidth: 465,
		height: 800,
		resizable: true,
		movable: true,
		webPreferences: {
			preload: PRELOAD_FILE,
		},
	});

	win.loadFile(INDEX_VIEW);
	Menu.setApplicationMenu(null);
};

app.on('ready', async () => {
	await setConfiguration();
	await applyConfiguration();

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

ipcMain.handle('get-song-picture-base64', async (_, { albumId, songId }: { albumId: number; songId: number }) => {
	try {
		const findAlbum = albumsData.find((album) => album.id === albumId);
		if (!findAlbum) throw new Error();

		const findSong = findAlbum.songs.find((song) => song.id === songId);
		if (!findSong) throw new Error();

		let metadata: mm.IAudioMetadata;
		const findMetadataCache = songsMetadata.find((data) => data.songId === songId && data.albumId === albumId);

		if (findMetadataCache) {
			metadata = findMetadataCache.metadata;
		} else {
			metadata = await mm.parseFile(findSong.completePath);
			if (!metadata) return await getPicture(findAlbum.picture);

			songsMetadata.push({
				albumId,
				songId,
				metadata,
			});
		}

		const { picture } = metadata.common;
		if (picture?.length === 0) return await getPicture(findAlbum.picture);

		const data = `data:image/jpg;base64,${picture?.[0].data.toString('base64')}`;
		return data;
	} catch (error) {
		return DEFAULT_IMAGE;
	}
});

ipcMain.handle('get-picture', async (_, data: IPicture) => {
	try {
		const picture = await getPicture(data);
		if (!picture) throw new Error();

		return picture;
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
				displayName: parseFilename(element.name),
				path,
				completePath: join(path, element.name),
				songs: [],
				picture: {
					name: '_',
					displayName: '_',
					path: '_',
					completePath: DEFAULT_IMAGE,
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
				displayName: parseFilename(element.name),
				path,
				completePath: join(path, element.name),
			});
		} else {
			album.picture = {
				name: element.name,
				displayName: parseFilename(element.name),
				path,
				completePath: join(path, element.name),
				isUrl: false,
			};
		}

		songs[albumIndex] = album;
	}

	return songs;
}

async function getPicture(data: IPicture | null) {
	try {
		if (!data) return null;
		if (data.isUrl) return data.completePath;

		const imageBuffer = await readFile(data.completePath);
		return `data:image/jpg;base64,${imageBuffer.toString('base64')}`;
	} catch {
		return null;
	}
}

function parseFilename(value: string) {
	const arr = value.split('.');
	if (arr.length === 1) return value;

	arr.pop();
	return arr.join();
}

const configPath = join(app.getPath('userData'), 'config.yml');
const defaultConfigPath = join(__dirname, '../config.default.yml');

async function setConfiguration() {
	try {
		const defaultConfig = await readFile(defaultConfigPath, 'utf8');

		if (!existsSync(configPath)) {
			await writeFile(configPath, defaultConfig, 'utf8');

			configuration = yaml.load(await readFile(configPath, 'utf-8')) as Record<string, any>;
			return;
		}

		if (process.env.NODE_ENV === 'development') {
			configuration = yaml.load(defaultConfig) as Record<string, any>;
			return;
		}

		configuration = yaml.load(await readFile(configPath, 'utf8')) as Record<string, any>;
	} catch (error) {
		configuration = {};
	}
}

async function applyConfiguration() {
	try {
		if (Object.keys(configuration).length === 0) return;

		// Apply path configuration
		musicPath = configuration?.path?.music_directory;
		if (musicPath) {
			albumsData = await searchSongs(musicPath);
		}
	} catch {}
}
