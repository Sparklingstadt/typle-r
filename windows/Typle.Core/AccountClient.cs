using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Typle.Core;

/// <summary>
/// Requests to the web app's Go backend (<c>/api/auth/*</c>, <c>/api/workspace</c>), with the app's token when it has
/// one. Its errors are the app's messages. Mirrors android/core/…/AccountClient.kt.
/// </summary>
public sealed class AccountClient
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(30);
    private readonly HttpClient http;

    /// <param name="baseUrl">The web app, such as https://typle-r-six.vercel.app.</param>
    /// <param name="handler">The transport; tests pass a stand-in for the backend.</param>
    public AccountClient(Uri baseUrl, HttpMessageHandler? handler = null)
    {
        BaseUrl = baseUrl;
        // The token must not follow a redirect to another address, and no cookie takes its place.
        http = new HttpClient(handler ?? new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = Timeout };
    }

    public Uri BaseUrl { get; }

    /// <summary><c>&lt;base&gt;/&lt;path&gt;</c>, whether or not the base ends with a slash; query values are percent-encoded.</summary>
    public Uri Url(string path, IReadOnlyList<KeyValuePair<string, string>>? query = null)
    {
        var url = BaseUrl.AbsoluteUri.TrimEnd('/') + "/" + path.TrimStart('/');
        if (query is { Count: > 0 })
        {
            url += "?" + string.Join("&", query.Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}"));
        }
        return new Uri(url);
    }

    public async Task<byte[]> SendAsync(string method, string path, byte[]? body = null, string? token = null, CancellationToken cancel = default)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), Url(path));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null)
        {
            request.Content = new ByteArrayContent(body);
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        }
        HttpResponseMessage response;
        byte[] data;
        try
        {
            response = await http.SendAsync(request, cancel).ConfigureAwait(false);
            data = await response.Content.ReadAsByteArrayAsync(cancel).ConfigureAwait(false);
        }
        catch (HttpRequestException)
        {
            throw new TypleException("accountUnreachable");
        }
        catch (TaskCanceledException) when (!cancel.IsCancellationRequested)
        {
            // HttpClient's timeout.
            throw new TypleException("accountUnreachable");
        }
        using (response)
        {
            var status = (int)response.StatusCode;
            if (status is < 200 or > 299) throw Accounts.Error(ErrorKey(data), status);
            return data;
        }
    }

    private sealed record ErrorBody(string Error);

    private static string? ErrorKey(byte[] data)
    {
        try
        {
            return JsonSerializer.Deserialize<ErrorBody>(data, TypleJson.Options)?.Error;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

/// <summary>
/// One GitHub login of the app, through the web app's login (README「iPad と Android と Windows のログイン」): it opens
/// <c>/api/auth/signin</c> with its own PKCE challenge, the login ends at <c>typle-r://login?code=…</c>, and the code and
/// the verifier, which never leaves the app, are traded for the app's token.
/// </summary>
public sealed class AccountLogin
{
    public const string CallbackScheme = "typle-r";

    public AccountLogin(Uri baseUrl, string? verifier = null, HttpMessageHandler? handler = null)
    {
        Verifier = verifier ?? NewVerifier();
        Client = new AccountClient(baseUrl, handler);
    }

    public string Verifier { get; }

    public AccountClient Client { get; }

    /// <summary>Where the login starts, for the browser that shows it.</summary>
    public Uri SigninUrl => Client.Url("api/auth/signin", [new("client", "windows"), new("code_challenge", ChallengeOf(Verifier))]);

    private sealed record TokenRequest(string Code, string Verifier);

    private sealed record TokenAnswer(string Token, AccountUser User);

    /// <summary>Trades the URL the login ended at for the app's token and the account.</summary>
    public async Task<(string Token, AccountUser User)> FinishAsync(string callback, CancellationToken cancel = default)
    {
        var code = CodeOf(callback) ?? throw new TypleException("accountLoginFailed");
        var body = TypleJson.Encode(new TokenRequest(code, Verifier));
        var answer = TypleJson.Decode<TokenAnswer>(await Client.SendAsync("POST", "api/auth/token", body, cancel: cancel).ConfigureAwait(false),
            "invalidServerData");
        return (answer.Token, answer.User);
    }

    /// <summary>The <c>code</c> of <c>typle-r://login?code=…</c>; null for any other address, an error answer or an empty code.</summary>
    public static string? CodeOf(string callback)
    {
        if (!Uri.TryCreate(callback, UriKind.Absolute, out var uri) || uri.Scheme != CallbackScheme || uri.Host != "login") return null;
        var query = uri.Query.TrimStart('?');
        if (query.Length == 0) return null;
        foreach (var pair in query.Split('&'))
        {
            var equals = pair.IndexOf('=');
            if (equals < 0 || WebUtility.UrlDecode(pair[..equals]) != "code") continue;
            var code = WebUtility.UrlDecode(pair[(equals + 1)..]);
            return code.Length > 0 ? code : null;
        }
        return null;
    }

    // 32 random bytes are a verifier of 43 characters, as the web app's login makes its own.
    public static string NewVerifier() => Base64Url(RandomNumberGenerator.GetBytes(32));

    public static string ChallengeOf(string verifier) => Base64Url(SHA256.HashData(Encoding.UTF8.GetBytes(verifier)));

    private static string Base64Url(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
