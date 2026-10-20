import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  alias(libs.plugins.kotlin.jvm)
  alias(libs.plugins.kotlin.serialization)
}

group = "io.github.sparklingstadt.typle"
version = "0.46.0"

dependencies {
  api(libs.serialization.json)
  testImplementation(libs.junit)
}

java {
  sourceCompatibility = JavaVersion.VERSION_17
  targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
  compilerOptions { jvmTarget = JvmTarget.JVM_17 }
}

tasks.test {
  testLogging { events("failed") }
}
