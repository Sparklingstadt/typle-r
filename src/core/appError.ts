import type errors from '../messages/ja/errors.json'

export type ErrorKey = keyof typeof errors
export type ErrorValues = Record<string, string | number>

// Errors name a message under the `errors` namespace instead of carrying text, so the screen shows them in the
// reader's language (see useErrorText).
export class AppError extends Error {
  constructor(readonly key: ErrorKey, readonly values: ErrorValues = {}) {
    super(key)
  }
}
