// One file per area of the app; every language has the same files and keys (see tests/i18n.test.cjs).
import errors from './errors.json'
import format from './format.json'
import common from './common.json'
import metadata from './metadata.json'
import nav from './nav.json'
import account from './account.json'
import settings from './settings.json'
import devices from './devices.json'
import guide from './guide.json'
import about from './about.json'
import home from './home.json'
import practice from './practice.json'
import wordLists from './wordLists.json'
import records from './records.json'
import rankings from './rankings.json'
import dashboard from './dashboard.json'
import globalError from './globalError.json'

const messages = { errors, format, common, metadata, nav, account, settings, devices, guide, about, home, practice, wordLists, records, rankings, dashboard, globalError }
export default messages
