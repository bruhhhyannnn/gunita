import { customAlphabet } from 'nanoid'

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const newId = customAlphabet(alphabet, 14)
export const shortId = customAlphabet(alphabet, 8)
