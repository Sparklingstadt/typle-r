import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.kotlin.serialization)
}

android {
  namespace = "io.github.sparklingstadt.typle"
  compileSdk = 35

  defaultConfig {
    applicationId = "io.github.sparklingstadt.typle"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "0.46.0"
  }

  buildFeatures {
    compose = true
    buildConfig = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  packaging {
    resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
  }
}

kotlin {
  compilerOptions { jvmTarget = JvmTarget.JVM_17 }
}

dependencies {
  implementation("io.github.sparklingstadt.typle:core")
  implementation(platform(libs.compose.bom))
  implementation(libs.compose.ui)
  implementation(libs.compose.foundation)
  implementation(libs.compose.material3)
  implementation(libs.compose.material.icons)
  implementation(libs.activity.compose)
  implementation(libs.lifecycle.viewmodel.compose)
  implementation(libs.androidx.browser)
  implementation(libs.coroutines.android)
  debugImplementation(libs.compose.ui.tooling)
}
