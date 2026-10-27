// The Japanese messages define the keys and their type; every language has the same files and keys (see tests/i18n.test.cjs).
import errors from '@/messages/ja/errors.json'
import format from '@/messages/ja/format.json'
import common from '@/messages/ja/common.json'
import metadata from '@/messages/ja/metadata.json'
import nav from '@/messages/ja/nav.json'
import account from '@/messages/ja/account.json'
import settings from '@/messages/ja/settings.json'
import devices from '@/messages/ja/devices.json'
import interests from '@/messages/ja/interests.json'
import guide from '@/messages/ja/guide.json'
import about from '@/messages/ja/about.json'
import home from '@/messages/ja/home.json'
import practice from '@/messages/ja/practice.json'
import wordLists from '@/messages/ja/wordLists.json'
import records from '@/messages/ja/records.json'
import rankings from '@/messages/ja/rankings.json'
import dashboard from '@/messages/ja/dashboard.json'
import globalError from '@/messages/ja/globalError.json'
import admin from '@/messages/ja/admin.json'

const messages = { errors, format, common, metadata, nav, account, settings, devices, interests, guide, about, home, practice, wordLists, records, rankings, dashboard, globalError, admin }
// Only the type is used: the messages themselves are loaded per language in messages.ts.
export type Messages = typeof messages
