import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const generate = customAlphabet(alphabet, 16);

export type IdPrefix =
  | 'usr'
  | 'sess'
  | 'mlt'
  | 'pri'
  | 'mem'
  | 'file'
  | 'qtr'
  | 'qwf'
  | 'task'
  | 'evt'
  | 'cfc'
  | 'cfe'
  | 'chs'
  | 'chm'
  | 'lock';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${generate()}`;
}
