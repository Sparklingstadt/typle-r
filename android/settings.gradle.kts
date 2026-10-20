// The Android tablet app. `core` (the rules shared with the web app) is its own build so it can be tested without the
// Android SDK; the app depends on it as io.github.sparklingstadt.typle:core.
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "typle-android"
includeBuild("core")
include(":app")
