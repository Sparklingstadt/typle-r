using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Typle.Storage;

/// <summary>
/// The choices remembered on this PC (language, theme, where data is kept, the device in use…), as named values in
/// <c>settings.json</c> of the app's folder. Each change is written at once.
/// </summary>
public sealed class Settings
{
    private readonly string path;
    private readonly Dictionary<string, string> values;

    public Settings(string directory)
    {
        Directory = directory;
        path = Path.Combine(directory, "settings.json");
        try
        {
            values = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllBytes(path)) ?? [];
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        {
            values = [];
        }
    }

    /// <summary>The app's folder: <c>%LOCALAPPDATA%\Typle</c>, or the sample data's own folder.</summary>
    public string Directory { get; }

    public string? Get(string key) => values.GetValueOrDefault(key);

    public bool Has(string key) => values.ContainsKey(key);

    /// <summary>Keeps a value, or forgets it for null.</summary>
    public void Set(string key, string? value)
    {
        if (value is null) values.Remove(key);
        else values[key] = value;
        Save();
    }

    private void Save()
    {
        try
        {
            System.IO.Directory.CreateDirectory(Directory);
            var temporary = path + ".tmp";
            File.WriteAllBytes(temporary, JsonSerializer.SerializeToUtf8Bytes(values));
            File.Move(temporary, path, overwrite: true);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            // A choice that cannot be kept still applies until the app is closed.
        }
    }
}

/// <summary>
/// The token of Typle's GitHub login (<c>/api/auth/token</c>), encrypted with Windows data protection (DPAPI) for this
/// Windows user, in <c>token.dat</c>. A token that can no longer be decrypted reads as none.
/// </summary>
public sealed class TokenVault(string directory)
{
    private static readonly byte[] Entropy = "typle-r:token"u8.ToArray();
    private readonly string path = Path.Combine(directory, "token.dat");

    public string? Read()
    {
        try
        {
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser));
        }
        catch (Exception error) when (error is IOException or CryptographicException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    /// <summary>Keeps the token, or forgets it for null. Throws when it cannot be kept.</summary>
    public void Write(string? token)
    {
        if (string.IsNullOrEmpty(token))
        {
            try
            {
                File.Delete(path);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
            }
            return;
        }
        Directory.CreateDirectory(directory);
        var temporary = path + ".tmp";
        File.WriteAllBytes(temporary, ProtectedData.Protect(Encoding.UTF8.GetBytes(token), Entropy, DataProtectionScope.CurrentUser));
        File.Move(temporary, path, overwrite: true);
    }
}
