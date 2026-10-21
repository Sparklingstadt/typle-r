package io.github.sparklingstadt.typle.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The token of Typle's GitHub login (`/api/auth/token`), encrypted with a key that never leaves this tablet's Android
 * Keystore. A token that can no longer be decrypted (the key was reset) reads as none.
 */
class TokenVault(context: Context) {
  private val prefs = context.getSharedPreferences("typle-token", Context.MODE_PRIVATE)

  private fun key(): SecretKey {
    val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  fun read(): String? {
    val stored = prefs.getString(TOKEN, null) ?: return null
    return try {
      val (iv, data) = stored.split(':').map { Base64.decode(it, Base64.NO_WRAP) }
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
      cipher.doFinal(data).decodeToString()
    } catch (_: GeneralSecurityException) {
      null
    } catch (_: IllegalArgumentException) {
      null
    } catch (_: IndexOutOfBoundsException) {
      null
    }
  }

  fun write(token: String?) {
    if (token.isNullOrEmpty()) {
      prefs.edit().remove(TOKEN).apply()
      return
    }
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val encoded = listOf(cipher.iv, cipher.doFinal(token.encodeToByteArray())).joinToString(":") { Base64.encodeToString(it, Base64.NO_WRAP) }
    prefs.edit().putString(TOKEN, encoded).apply()
  }

  private companion object {
    const val KEYSTORE = "AndroidKeyStore"
    const val ALIAS = "typle-token"
    const val TOKEN = "token"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
  }
}
