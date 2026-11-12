import { AppError } from './appError'
import { ApiError, api, withQuery } from './api'

export const GALLERY_SORTS = ['new', 'popular'] as const
export type GallerySort = typeof GALLERY_SORTS[number]
export type GalleryQuery = { text: string; category: string; sort: GallerySort }
export type GalleryPack = { id: string; name: string; description?: string; category?: string; tags?: string[]; lists: number; words: number; added: number; updatedAt: string }
export type GalleryPage = { packs: GalleryPack[]; more: boolean }
export type GalleryCategory = { name: string; count: number }

const DEFAULT_SORT: GallerySort = 'new'

export function galleryQueryOf(params: URLSearchParams): GalleryQuery {
  const sort = params.get('sort')
  return {
    text: params.get('q') ?? '',
    category: params.get('category') ?? '',
    sort: GALLERY_SORTS.find(value => value === sort) ?? DEFAULT_SORT,
  }
}

// The address bar form: empty values and the default sort are left out.
export function gallerySearchParams(query: GalleryQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.text) params.set('q', query.text)
  if (query.category) params.set('category', query.category)
  if (query.sort !== DEFAULT_SORT) params.set('sort', query.sort)
  return params
}

/** The URL of one page of the search on `/api/gallery`. */
export function galleryPath(query: GalleryQuery, page: number) {
  return withQuery('/api/gallery', { q: query.text, category: query.category, sort: query.sort, page })
}

/** One page of the gallery, through `/api/gallery`. A search the server refuses is `invalidQuery`. */
export async function fetchGalleryPage(query: GalleryQuery, page: number): Promise<GalleryPage> {
  try {
    return decodeGalleryPage(await api(galleryPath(query, page)))
  } catch (reason) {
    if (reason instanceof ApiError && reason.key === 'invalidQuery') throw new AppError('invalidQuery')
    throw reason
  }
}

/** The categories of the listed packs, the most packs first. */
export async function fetchGalleryCategories(): Promise<GalleryCategory[]> {
  return decodeGalleryCategories(await api('/api/gallery/categories'))
}

const invalid = () => new AppError('invalidServerData')

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw invalid()
  return value
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid()
  return value
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalid()
  return value
}

function decodePack(value: unknown): GalleryPack {
  const data = record(value)
  const pack: GalleryPack = {
    id: text(data.id),
    name: text(data.name),
    lists: count(data.lists),
    words: count(data.words),
    added: count(data.added),
    updatedAt: text(data.updatedAt),
  }
  // A pack without them has them null (or left out).
  if (data.description != null) pack.description = text(data.description)
  if (data.category != null) pack.category = text(data.category)
  if (data.tags != null) pack.tags = array(data.tags).map(text)
  return pack
}

export function decodeGalleryPage(data: unknown): GalleryPage {
  const body = record(data)
  if (typeof body.more !== 'boolean') throw invalid()
  return { packs: array(body.packs).map(decodePack), more: body.more }
}

export function decodeGalleryCategories(data: unknown): GalleryCategory[] {
  return array(record(data).categories).map(item => {
    const category = record(item)
    return { name: text(category.name), count: count(category.count) }
  })
}
