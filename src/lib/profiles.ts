import { decodeDevices, type PracticeDevice } from './devices'
import { decodeLists, type SavedWordList } from './wordLists'

// A profile keeps its own word lists and records (e.g. everyday typing, Chinese, Korean). Devices are shared by the account.
// The first profile's lists stay in the workspace's `lists` column, so clients that predate profiles still read and write it.
export const DEFAULT_PROFILE_ID = 'default'
export const DEFAULT_PROFILE_NAME = 'メイン'
export const MAX_PROFILES = 10
export const MAX_PROFILE_NAME = 50

export type ProfileDraft = { id: string; name: string }
export type ProfileSummary = ProfileDraft & { listCount: number; recordCount: number }
export type StoredProfile = ProfileDraft & { lists?: SavedWordList[] }
export type WorkspaceDocument = { lists: SavedWordList[]; devices: PracticeDevice[]; profiles: StoredProfile[] }
export type WorkspaceView = { lists: SavedWordList[]; devices: PracticeDevice[]; profiles: ProfileSummary[]; profileId: string }
/** `lists` replaces the lists of `profileId`; `profiles` is the complete set of names after the change. Omitted parts stay as they are. */
export type WorkspaceChange = { profileId: string; lists?: SavedWordList[]; devices?: PracticeDevice[]; profiles?: ProfileDraft[] }

function isDraft(value: unknown): value is ProfileDraft {
  if (!value || typeof value !== 'object') return false
  const profile = value as Record<string, unknown>
  return typeof profile.id === 'string' && /^[\w-]{1,100}$/.test(profile.id) &&
    typeof profile.name === 'string' && profile.name.trim().length > 0 && profile.name.length <= MAX_PROFILE_NAME
}

export function decodeProfileDrafts(value: unknown): ProfileDraft[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PROFILES || !value.every(isDraft) ||
    value[0].id !== DEFAULT_PROFILE_ID || new Set(value.map(profile => profile.id)).size !== value.length ||
    new Set(value.map(profile => profile.name.trim().toLocaleLowerCase())).size !== value.length) {
    throw new Error('プロファイルの形式を確認してください。')
  }
  return value.map(({ id, name }) => ({ id, name: name.trim() }))
}

export function decodeProfileSummaries(value: unknown): ProfileSummary[] {
  const drafts = decodeProfileDrafts(value)
  const counts = (value as Record<string, unknown>[]).map(({ listCount, recordCount }) => ({ listCount, recordCount }))
  if (!counts.every(count => Number.isSafeInteger(count.listCount) && Number.isSafeInteger(count.recordCount))) {
    throw new Error('プロファイルの形式を確認してください。')
  }
  return drafts.map((draft, index) => ({ ...draft, listCount: Number(counts[index].listCount), recordCount: Number(counts[index].recordCount) }))
}

/** Reads the stored `profiles` column; an empty array means only the first profile exists. */
export function decodeStoredProfiles(value: unknown): StoredProfile[] {
  if (!Array.isArray(value)) throw new Error('プロファイルの形式を確認してください。')
  const stored = value.length ? value : [{ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }]
  const drafts = decodeProfileDrafts(stored)
  return drafts.map((profile, index) => index === 0 ? profile
    : { ...profile, lists: decodeLists(JSON.stringify({ version: 1, lists: (stored[index] as StoredProfile).lists ?? [] })) })
}

export function decodeDocument(value: { lists: unknown; devices: unknown; profiles?: unknown }): WorkspaceDocument {
  return { lists: decodeLists(JSON.stringify({ version: 1, lists: value.lists })), devices: decodeDevices(value.devices ?? []),
    profiles: decodeStoredProfiles(value.profiles ?? []) }
}

function profileLists(document: WorkspaceDocument, id: string) {
  return id === DEFAULT_PROFILE_ID ? document.lists : document.profiles.find(profile => profile.id === id)?.lists ?? []
}

/** What one profile sees. An unknown id (e.g. deleted on another screen) falls back to the first profile. */
export function viewDocument(document: WorkspaceDocument, profileId: string): WorkspaceView {
  const id = document.profiles.some(profile => profile.id === profileId) ? profileId : DEFAULT_PROFILE_ID
  return {
    devices: document.devices,
    profileId: id,
    lists: profileLists(document, id),
    profiles: document.profiles.map(({ id, name }) => {
      const lists = profileLists(document, id)
      return { id, name, listCount: lists.length, recordCount: lists.reduce((total, list) => total + list.records.length, 0) }
    }),
  }
}

export class MissingProfileError extends Error {
  constructor() { super('このプロファイルは削除されています。画面を開き直してください。') }
}

export function applyChange(document: WorkspaceDocument, change: WorkspaceChange): WorkspaceDocument {
  const drafts = change.profiles ?? document.profiles
  if (!drafts.some(profile => profile.id === change.profileId)) throw new MissingProfileError()
  const profiles = drafts.map(({ id, name }, index) => index === 0 ? { id, name }
    : { id, name, lists: id === change.profileId && change.lists ? change.lists : profileLists(document, id) })
  return {
    lists: change.profileId === DEFAULT_PROFILE_ID && change.lists ? change.lists : document.lists,
    devices: change.devices ?? document.devices,
    profiles,
  }
}

export type ProfileProblem = { field: 'name' | 'form'; message: string }

// Explains why a profile cannot be saved, in terms of the field to fix.
export function profileProblem(profiles: ProfileDraft[], profile: ProfileDraft, editing: boolean): ProfileProblem | null {
  const name = profile.name.trim()
  if (!name) return { field: 'name', message: 'プロファイル名を入力してください。' }
  if (profile.name.length > MAX_PROFILE_NAME) return { field: 'name', message: `プロファイル名は${MAX_PROFILE_NAME}文字以内で入力してください。` }
  if (editing && !profiles.some(item => item.id === profile.id)) return { field: 'form', message: 'このプロファイルは別の画面で削除されています。' }
  const same = profiles.find(item => item.id !== profile.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (same) return { field: 'name', message: `「${same.name}」はすでにあります。別の名前にしてください。` }
  if (!editing && profiles.length >= MAX_PROFILES) {
    return { field: 'form', message: `プロファイルは${MAX_PROFILES}個まで作成できます。使わなくなったプロファイルを削除してから追加してください。` }
  }
  return null
}

export function saveProfile(profiles: ProfileDraft[], profile: ProfileDraft, editing: boolean): ProfileDraft[] {
  const problem = profileProblem(profiles, profile, editing)
  if (problem) throw new Error(problem.message)
  const drafts = profiles.map(({ id, name }) => ({ id, name }))
  const normalized = { id: profile.id, name: profile.name.trim() }
  return decodeProfileDrafts(editing ? drafts.map(item => item.id === profile.id ? normalized : item) : [...drafts, normalized])
}

export function removeProfile(profiles: ProfileDraft[], id: string): ProfileDraft[] {
  if (id === DEFAULT_PROFILE_ID) throw new Error('最初のプロファイルは削除できません。')
  return decodeProfileDrafts(profiles.filter(profile => profile.id !== id).map(({ id, name }) => ({ id, name })))
}
