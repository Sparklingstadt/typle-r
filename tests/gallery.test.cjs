require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { galleryQueryOf, gallerySearchParams, galleryPath, decodeGalleryPage, decodeGalleryCategories } = require('../src/core/gallery.ts')

const pack = { id: 'x', name: 'Linux', lists: 2, words: 40, added: 3, updatedAt: '2026-10-01T00:00:00Z' }
const invalid = error => error.key === 'invalidServerData'

test('galleryQueryOf reads the conditions and falls back to new', () => {
  assert.deepEqual(galleryQueryOf(new URLSearchParams('q=abc&sort=old')), { text: 'abc', category: '', sort: 'new' })
  assert.deepEqual(galleryQueryOf(new URLSearchParams('category=x&sort=popular')), { text: '', category: 'x', sort: 'popular' })
  assert.deepEqual(galleryQueryOf(new URLSearchParams('')), { text: '', category: '', sort: 'new' })
})

test('gallerySearchParams omits empty values and the default sort', () => {
  assert.equal(gallerySearchParams({ text: '', category: '語学', sort: 'new' }).toString(), 'category=%E8%AA%9E%E5%AD%A6')
  assert.equal(gallerySearchParams({ text: '', category: '', sort: 'new' }).toString(), '')
  assert.equal(gallerySearchParams({ text: 'a', category: '', sort: 'popular' }).toString(), 'q=a&sort=popular')
})

test('conditions survive a round trip', () => {
  for (const query of [{ text: 'a b&c', category: '語学', sort: 'popular' }, { text: '', category: '', sort: 'new' }]) {
    assert.deepEqual(galleryQueryOf(gallerySearchParams(query)), query)
  }
})

test('galleryPath includes every condition and the page', () => {
  assert.equal(galleryPath({ text: 'a', category: 'c', sort: 'popular' }, 2), '/api/gallery?q=a&category=c&sort=popular&page=2')
  assert.equal(galleryPath({ text: '', category: '', sort: 'new' }, 1), '/api/gallery?q=&category=&sort=new&page=1')
})

test('decodeGalleryPage reads a pack whose description, category and tags are null as one without them', () => {
  const bare = { id: 'b', name: 'B', lists: 1, words: 2, added: 0, updatedAt: '2026-11-01T00:00:00Z' }
  assert.deepEqual(decodeGalleryPage({ packs: [{ ...bare, description: null, category: null, tags: null }], more: false }), { packs: [bare], more: false })
})

test('decodeGalleryPage returns a correct answer as is', () => {
  const data = { packs: [pack, { ...pack, id: 'y', description: 'd', category: 'c', tags: ['t'] }], more: true }
  assert.deepEqual(decodeGalleryPage(data), data)
})

test('decodeGalleryPage rejects a wrong shape', () => {
  assert.throws(() => decodeGalleryPage({ packs: [{ id: 'x' }], more: false }), invalid)
  assert.throws(() => decodeGalleryPage({ packs: [{ ...pack, tags: ['a', 1] }], more: false }), invalid)
  assert.throws(() => decodeGalleryPage({ packs: [pack] }), invalid)
  assert.throws(() => decodeGalleryPage(null), invalid)
  assert.throws(() => decodeGalleryPage({ packs: {}, more: false }), invalid)
})

test('decodeGalleryCategories', () => {
  assert.deepEqual(decodeGalleryCategories({ categories: [{ name: 'a', count: 2 }] }), [{ name: 'a', count: 2 }])
  assert.throws(() => decodeGalleryCategories({ categories: [{ name: 'a' }] }), invalid)
  assert.throws(() => decodeGalleryCategories([]), invalid)
})
