import { IPicture } from './picture.interface';
import { ISong } from './song.interface';

export interface IAlbum {
	id: number;
	name: string;
	path: string;
	completePath: string;
	songs: ISong[];
	picture: IPicture | null;
}
