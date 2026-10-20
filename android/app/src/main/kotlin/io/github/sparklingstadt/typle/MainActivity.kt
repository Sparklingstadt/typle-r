package io.github.sparklingstadt.typle

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // The debug build reads the screenshots' launch extras before the app's state is made.
    DemoEntry.prepare(this, intent)
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent { TypleRoot() }
  }
}
