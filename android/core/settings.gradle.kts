// The rules Typle shares with the web app (src/core), with no Android dependency, so `gradle test` runs on any JVM.
// android/settings.gradle.kts includes this build for the app.
rootProject.name = "core"

pluginManagement {
  repositories {
    gradlePluginPortal()
    mavenCentral()
  }
}

dependencyResolutionManagement {
  repositories { mavenCentral() }
  versionCatalogs { create("libs") { from(files("../gradle/libs.versions.toml")) } }
}
