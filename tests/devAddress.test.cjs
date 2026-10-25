const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const { webAddress, backendOf, kotlinBackendDir, javaMajorVersion } = require('../scripts/dev.cjs')

test('typle-web listens where TYPLE_WEB_URL points', () => {
  assert.equal(webAddress(undefined), '127.0.0.1:8081')
  assert.equal(webAddress(''), '127.0.0.1:8081')
  assert.equal(webAddress('http://127.0.0.1:8081'), '127.0.0.1:8081')
  assert.equal(webAddress('http://127.0.0.1:9000/'), '127.0.0.1:9000')
  assert.equal(webAddress('http://localhost:9001'), 'localhost:9001')
  assert.equal(webAddress('http://[::1]:9002'), '[::1]:9002')
  assert.equal(webAddress('http://localhost'), 'localhost:80')
})

// typle-web speaks plain HTTP only, so an https:// URL could never be reached: npm run dev stops at once and says so.
test('a TYPLE_WEB_URL with https is refused', () => {
  for (const value of ['https://backend.test', 'https://127.0.0.1:8081', 'HTTPS://localhost:9000']) {
    assert.throws(() => webAddress(value), error => /TYPLE_WEB_URL/.test(error.message) && /https/.test(error.message) && /HTTP/.test(error.message), value)
  }
})

test('a TYPLE_WEB_URL that is not an http URL is refused', () => {
  for (const value of ['localhost:8081', 'ftp://x', 'not a url', 'http://']) {
    assert.throws(() => webAddress(value), /TYPLE_WEB_URL/, value)
  }
})

// TYPLE_BACKEND picks the backend npm run dev starts beside next dev: the Go one unless it says kotlin.
test('TYPLE_BACKEND picks the backend', () => {
  assert.equal(backendOf(undefined), 'go')
  assert.equal(backendOf(''), 'go')
  assert.equal(backendOf('go'), 'go')
  assert.equal(backendOf('kotlin'), 'kotlin')
  for (const value of ['Kotlin', 'java', 'rust', ' go']) {
    assert.throws(() => backendOf(value), error => /TYPLE_BACKEND/.test(error.message) && /go か kotlin/.test(error.message), value)
  }
})

// The Kotlin backend is the typle-kotlin-backend repository: beside this one unless TYPLE_KOTLIN_BACKEND says where.
test('TYPLE_KOTLIN_BACKEND names the Kotlin backend checkout', () => {
  const root = path.join(__dirname, '..')
  assert.equal(kotlinBackendDir(undefined), path.join(root, '..', 'typle-kotlin-backend'))
  assert.equal(kotlinBackendDir(''), path.join(root, '..', 'typle-kotlin-backend'))
  assert.equal(kotlinBackendDir('/work/kotlin'), '/work/kotlin')
  assert.equal(kotlinBackendDir('../k'), path.join(root, '..', 'k'))
})

// The Kotlin backend builds with Gradle 8.14 and a Java 21 toolchain, so npm run dev checks the Java it finds first.
test('the major version of java -version', () => {
  assert.equal(javaMajorVersion('openjdk version "21.0.12.1" 2026-08-18\nOpenJDK Runtime Environment'), 21)
  assert.equal(javaMajorVersion('Picked up JAVA_TOOL_OPTIONS: -Dx=y\nopenjdk version "25" 2025-09-16'), 25)
  assert.equal(javaMajorVersion('java version "1.8.0_402"'), 8)
  assert.equal(javaMajorVersion('openjdk version "17.0.2" 2022-01-18'), 17)
  assert.equal(javaMajorVersion('no version here'), null)
})
